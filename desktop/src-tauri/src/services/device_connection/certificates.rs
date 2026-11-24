//! Samsung certificate issuance and private, atomic signing-profile storage.
mod crypto;
use super::{
    profile::{signing_ready, supported_duid, CERTIFICATE_FILES},
    TvConnection,
};
use crate::{
    models::{AppError, AppResult, SigningProfile},
    services::{http::bounded_body, samsung_auth},
};
use reqwest::{
    multipart::{Form, Part},
    redirect::Policy,
    Client,
};
use serde_json::Value;
use std::{
    future::Future,
    io::Write,
    path::{Path, PathBuf},
    time::Duration,
};
use tokio::time::timeout;

const PREPARE_TIMEOUT: Duration = Duration::from_secs(320);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_RESPONSE_BYTES: usize = 512 * 1024;
const AUTHOR_URL: &str = "https://svdca.samsungqbe.com/apis/v3/authors";
const DISTRIBUTOR_PROFILE_URL: &str = "https://svdca.samsungqbe.com/apis/v1/distributors";
const DISTRIBUTOR_URL: &str = "https://svdca.samsungqbe.com/apis/v3/distributors";
const AUTHOR_CA: &[u8] =
    include_bytes!("../../../../../cli/src/aerotizen/ca/vd_tizen_dev_author_ca.cer");
const DISTRIBUTOR_CA: &[u8] =
    include_bytes!("../../../../../cli/src/aerotizen/ca/vd_tizen_dev_public2.crt");

fn failed() -> AppError {
    AppError::new(
        "certificates_failed",
        "Samsung could not create the signing certificates. Sign in again and retry.",
    )
}
fn incomplete() -> AppError {
    AppError::new(
        "signing_profile_incomplete",
        "The existing signing profile is incomplete. Restore its original files before continuing.",
    )
}

// Never serialized to the UI or formatted into errors.
struct CreatedProfile {
    author: Vec<u8>,
    distributor: Vec<u8>,
    password: String,
    profile_xml: Vec<u8>,
}
#[derive(Clone, Copy)]
enum CertificateRequest {
    Author,
    DeviceProfile,
    Distributor,
}
impl CertificateRequest {
    fn index(self) -> usize {
        match self {
            Self::Author => 0,
            Self::DeviceProfile => 1,
            Self::Distributor => 2,
        }
    }
}

struct Issuer {
    client: Client,
    endpoints: [String; 3],
    author_ca: Vec<u8>,
    distributor_ca: Vec<u8>,
}
impl Issuer {
    fn production() -> AppResult<Self> {
        let client = Client::builder()
            .https_only(true)
            .retry(reqwest::retry::never())
            .redirect(Policy::none())
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|_| failed())?;
        Ok(Self {
            client,
            endpoints: [
                AUTHOR_URL.into(),
                DISTRIBUTOR_PROFILE_URL.into(),
                DISTRIBUTOR_URL.into(),
            ],
            author_ca: AUTHOR_CA.into(),
            distributor_ca: DISTRIBUTOR_CA.into(),
        })
    }
    async fn post(
        &self,
        request: CertificateRequest,
        auth: &Value,
        csr: Vec<u8>,
    ) -> AppResult<Vec<u8>> {
        let index = request.index();
        let file = if matches!(request, CertificateRequest::Author) {
            "author.csr"
        } else {
            "distributor.csr"
        };
        let mut form = Form::new()
            .text(
                "access_token",
                auth["access_token"].as_str().ok_or_else(failed)?.to_owned(),
            )
            .text(
                "user_id",
                auth["userId"].as_str().ok_or_else(failed)?.to_owned(),
            )
            .text("platform", "VD");
        if !matches!(request, CertificateRequest::Author) {
            form = form
                .text("privilege_level", "public")
                .text("developer_type", "Individual");
        }
        form = form.part(
            "csr",
            Part::bytes(csr)
                .file_name(file)
                .mime_str("application/octet-stream")
                .map_err(|_| failed())?,
        );
        let response = self
            .client
            .post(&self.endpoints[index])
            .multipart(form)
            .send()
            .await
            .map_err(|_| failed())?;
        if !response.status().is_success() {
            return Err(failed());
        }
        bounded_body(response, MAX_RESPONSE_BYTES)
            .await
            .filter(|body| !body.is_empty())
            .ok_or_else(failed)
    }
    async fn issue(self, duid: String, auth: Value) -> AppResult<CreatedProfile> {
        if !samsung_auth::valid_auth(&auth) {
            return Err(failed());
        }
        let email = auth
            .get("inputEmailID")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        let material = tokio::task::spawn_blocking(move || crypto::material(&duid, &email))
            .await
            .map_err(|_| failed())??;
        // Issuance is not retried: the server may have accepted a request before a lost reply.
        let author = self
            .post(
                CertificateRequest::Author,
                &auth,
                material.author_csr.clone(),
            )
            .await?;
        let profile_xml = self
            .post(
                CertificateRequest::DeviceProfile,
                &auth,
                material.distributor_csr.clone(),
            )
            .await?;
        let distributor = self
            .post(
                CertificateRequest::Distributor,
                &auth,
                material.distributor_csr.clone(),
            )
            .await?;
        tokio::task::spawn_blocking(move || {
            crypto::package(
                material,
                author,
                distributor,
                profile_xml,
                self.author_ca,
                self.distributor_ca,
            )
        })
        .await
        .map_err(|_| failed())?
    }
}

fn profile_state(directory: &Path, duid: &str) -> AppResult<bool> {
    if !supported_duid(duid) {
        return Err(failed());
    }
    if signing_ready(directory, duid) {
        return Ok(true);
    }
    let path = directory.join("certs").join(duid);
    match std::fs::symlink_metadata(path) {
        Ok(_) => Err(incomplete()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(_) => Err(failed()),
    }
}

fn publish(directory: PathBuf, duid: &str, profile: CreatedProfile) -> AppResult<()> {
    if profile_state(&directory, duid)? {
        return Ok(());
    }
    let parent = directory.join("certs");
    let mut builder = std::fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(&parent).map_err(|_| failed())?;
    let temporary = tempfile::tempdir_in(&parent).map_err(|_| failed())?;
    let staged = temporary.path().join("profile");
    builder.create(&staged).map_err(|_| failed())?;
    let files = [
        profile.author,
        profile.distributor,
        profile.password.into_bytes(),
        profile.profile_xml,
    ];
    for (name, bytes) in CERTIFICATE_FILES.into_iter().zip(files) {
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(staged.join(name)).map_err(|_| failed())?;
        file.write_all(&bytes).map_err(|_| failed())?;
        file.sync_all().map_err(|_| failed())?;
    }
    if profile_state(&directory, duid)? {
        return Ok(());
    }
    std::fs::rename(staged, parent.join(duid)).map_err(|_| failed())?;
    if !signing_ready(&directory, duid) {
        return Err(failed());
    }
    Ok(())
}

impl TvConnection {
    pub async fn prepare_certificates(
        &self,
        host: &str,
        expected: &str,
        auth: Option<Value>,
    ) -> AppResult<SigningProfile> {
        self.prepare_certificates_with(host, expected, auth, |duid, auth| async move {
            Issuer::production()?.issue(duid, auth).await
        })
        .await
    }

    async fn prepare_certificates_with<Issue, Pending>(
        &self,
        host: &str,
        expected: &str,
        auth: Option<Value>,
        issue: Issue,
    ) -> AppResult<SigningProfile>
    where
        Issue: FnOnce(String, Value) -> Pending + Send,
        Pending: Future<Output = AppResult<CreatedProfile>> + Send,
    {
        timeout(PREPARE_TIMEOUT, async {
            let mut session = self.session(host, expected).await?;
            let duid = session.identity().await?;
            if !supported_duid(&duid) {
                return Err(AppError::new(
                    "identity_unavailable",
                    "The TV did not return a supported device identity.",
                ));
            }
            let directory = self.directory.clone();
            let device = duid.clone();
            let ready = tokio::task::spawn_blocking(move || profile_state(&directory, &device))
                .await
                .map_err(|_| failed())??;
            if !ready {
                let auth = auth.filter(samsung_auth::valid_auth).ok_or_else(|| {
                    AppError::new(
                        "samsung_sign_in_required",
                        "Sign in to Samsung to set up this TV.",
                    )
                })?;
                let profile = issue(duid.clone(), auth).await?;
                session.identity().await?;
                session.unchanged().await?;
                let directory = self.directory.clone();
                tokio::task::spawn_blocking(move || publish(directory, &duid, profile))
                    .await
                    .map_err(|_| failed())??;
            }
            session.unchanged().await?;
            Ok(SigningProfile {
                identity_sha256: expected.into(),
                launcher_signing_ready: true,
            })
        })
        .await
        .map_err(|_| failed())?
    }
}

#[cfg(test)]
mod tests;
