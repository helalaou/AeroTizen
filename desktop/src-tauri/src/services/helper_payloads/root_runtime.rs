use super::*;
use crate::services::{root_bridge::HELPER_APP_ID, root_pairing::PAIRING_VERSION};
const NAMESPACE: &str = "http://tizen.org/ns/packages";
const MAX_RUNTIME_BYTES: usize = 8 * 1024 * 1024;
const MAX_MANIFEST_BYTES: usize = 64 * 1024;
fn attributes(node: roxmltree::Node<'_, '_>, values: &[(&str, &str)]) -> bool {
    node.attributes().len() == values.len()
        && values
            .iter()
            .all(|(key, value)| node.attribute(*key) == Some(*value))
}
fn manifest(xml: &str) -> AppResult<()> {
    if xml.len() > MAX_MANIFEST_BYTES {
        return Err(unavailable());
    }
    let document = roxmltree::Document::parse(xml).map_err(|_| unavailable())?;
    let root = document.root_element();
    let children: Vec<_> = root
        .children()
        .filter(roxmltree::Node::is_element)
        .collect();
    if !root.has_tag_name((NAMESPACE, "manifest"))
        || !attributes(
            root,
            &[
                ("package", HELPER_APP_ID),
                ("api-version", "6.0"),
                ("version", env!("ROOT_RUNTIME_VERSION")),
            ],
        )
        || children.len() != 3
        || !children[0].has_tag_name((NAMESPACE, "profile"))
        || !attributes(children[0], &[("name", "tv-samsung")])
        || !children[1].has_tag_name((NAMESPACE, "service-application"))
        || !children[2].has_tag_name((NAMESPACE, "privileges"))
    {
        return Err(unavailable());
    }
    let app = children[1];
    let app_children: Vec<_> = app.children().filter(roxmltree::Node::is_element).collect();
    let privileges: Vec<_> = children[2]
        .children()
        .filter(roxmltree::Node::is_element)
        .collect();
    if !attributes(
        app,
        &[
            ("appid", HELPER_APP_ID),
            ("exec", "AeroTizenRootHelper.dll"),
            ("type", "dotnet"),
            ("multiple", "false"),
            ("taskmanage", "false"),
            ("nodisplay", "true"),
            ("on-boot", "true"),
            ("auto-restart", "false"),
        ],
    ) || app_children.len() != 2
        || !app_children[0].has_tag_name((NAMESPACE, "label"))
        || app_children[0].text() != Some("AeroTizen Root Helper")
        || !app_children[1].has_tag_name((NAMESPACE, "icon"))
        || app_children[1].text() != Some("root-helper.png")
        || privileges.len() != 1
        || !privileges[0].has_tag_name((NAMESPACE, "privilege"))
        || privileges[0].text() != Some("http://tizen.org/privilege/internet")
    {
        return Err(unavailable());
    }
    Ok(())
}
pub(super) fn runtime(bytes: &[u8]) -> AppResult<Runtime> {
    if bytes.len() > MAX_RUNTIME_BYTES {
        return Err(unavailable());
    }
    let document: Value = serde_json::from_slice(bytes).map_err(|_| unavailable())?;
    if document["version"] != PAIRING_VERSION {
        return Err(unavailable());
    }
    manifest(document["manifest"].as_str().ok_or_else(unavailable)?)?;
    let icon = document["icon"]
        .as_str()
        .filter(|value| value.len() <= MAX_FILE_BYTES.div_ceil(3) * 4)
        .ok_or_else(unavailable)?;
    let icon = STANDARD.decode(icon).map_err(|_| unavailable())?;
    let mut names = Vec::new();
    for (prefix, name) in [
        ("bin/", "AeroTizenRootHelper"),
        ("bin/", "AeroTizenRootBridge"),
        ("res/runner/", "AeroTizenRootProbe"),
        ("res/setup/", "AeroTizenBootWriter"),
    ] {
        for suffix in [".dll", ".runtimeconfig.json", ".deps.json"] {
            names.push(format!("{prefix}{name}{suffix}"));
        }
    }
    let names: Vec<_> = names.iter().map(String::as_str).collect();
    let files = load(bytes, &names)?;
    Ok(Runtime {
        files,
        manifest: document["manifest"].as_str().unwrap().as_bytes().to_vec(),
        icon,
    })
}
pub(in crate::services) struct Runtime {
    pub files: Vec<PayloadFile>,
    pub manifest: Vec<u8>,
    pub icon: Vec<u8>,
}
impl Runtime {
    pub fn flat_group(&self, prefix: &str) -> Vec<PayloadFile> {
        self.files
            .iter()
            .filter(|file| file.name.starts_with(prefix))
            .map(|file| PayloadFile {
                name: file.name.rsplit('/').next().unwrap().into(),
                bytes: file.bytes.clone(),
            })
            .collect()
    }
}
pub(super) fn bridge(bytes: &[u8]) -> AppResult<Vec<PayloadFile>> {
    Ok(runtime(bytes)?.flat_group("bin/AeroTizenRootBridge"))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn document() -> Value {
        let manifest = include_str!("../../../../tests/fixtures/root-manifest.xml")
            .replace("ROOT_RUNTIME_VERSION", env!("ROOT_RUNTIME_VERSION"));
        let mut files = serde_json::Map::new();
        for (prefix, name) in [
            ("bin/", "AeroTizenRootHelper"),
            ("bin/", "AeroTizenRootBridge"),
            ("res/runner/", "AeroTizenRootProbe"),
            ("res/setup/", "AeroTizenBootWriter"),
        ] {
            for suffix in [".dll", ".runtimeconfig.json", ".deps.json"] {
                files.insert(format!("{prefix}{name}{suffix}"),serde_json::json!({"base64":STANDARD.encode(b"synthetic"),"sha256":sha256_hex(b"synthetic")}));
            }
        }
        serde_json::json!({"schema_version":1,"version":PAIRING_VERSION,"manifest":manifest,"icon":STANDARD.encode(b"icon"),"files":files})
    }
    #[test]
    fn root_queries_require_the_complete_matching_runtime_and_dedicated_service_manifest() {
        let original = document();
        let files = bridge(&serde_json::to_vec(&original).unwrap()).unwrap();
        assert_eq!(files.len(), 3);
        assert_eq!(files[0].name, "AeroTizenRootBridge.dll");
        for scenario in ["version", "manifest", "files", "checksum"] {
            let mut document = original.clone();
            match scenario {
                "version" => document["version"] = serde_json::json!("changed"),
                "manifest" => {
                    document["manifest"] = serde_json::json!(document["manifest"]
                        .as_str()
                        .unwrap()
                        .replace("on-boot=\"true\"", "on-boot=\"false\""))
                }
                "files" => {
                    document["files"]
                        .as_object_mut()
                        .unwrap()
                        .remove("bin/AeroTizenRootHelper.dll");
                }
                _ => {
                    document["files"]["bin/AeroTizenRootBridge.dll"]["sha256"] =
                        serde_json::json!("a".repeat(64))
                }
            };
            assert!(
                bridge(&serde_json::to_vec(&document).unwrap()).is_err(),
                "{scenario}"
            );
        }
    }
    #[cfg(feature = "desktop-app")]
    #[test]
    fn compiled_root_bridge_is_present_without_a_worker_request() {
        let files = bridge(ROOT).unwrap();
        assert!(files[0].bytes.starts_with(b"MZ"));
    }
}
