pub mod apps;
pub mod buttons;
pub mod home;
pub mod launcher;
pub mod local_apps;
mod logs;
pub mod root;
pub mod samsung;
pub mod tvs;

pub fn register<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        launcher::desktop_status,
        logs::save_desktop_logs,
        samsung::samsung_account,
        samsung::samsung_sign_in,
        samsung::cancel_samsung_sign_in,
        samsung::samsung_sign_out,
        samsung::prepare_signing_profile,
        tvs::list_tvs,
        apps::list_tv_apps,
        buttons::list_tv_buttons,
        buttons::list_tv_button_apps,
        root::root_access_status,
        root::reveal_root_recovery,
        root::remove_root_access,
        root::setup_root_access,
        root::upgrade_root_access,
        buttons::change_tv_button,
        tvs::cancel_tv_read,
        apps::remove_tv_apps,
        launcher::launcher_catalog,
        launcher::install_launcher,
        launcher::review_launcher_removal,
        launcher::remove_launcher,
        local_apps::choose_local_app,
        local_apps::install_local_app,
        tvs::discover_tvs,
        tvs::connect_tv,
        tvs::check_tv_diagnostics,
        home::read_home_backup,
        home::prepare_native_home,
        home::apply_native_home,
        home::restore_home_backup,
        tvs::rename_tv,
        tvs::forget_tv
    ])
}
