fn main() {
    println!("cargo:rerun-if-env-changed=TINO_APP_ENV");
    println!("cargo:rerun-if-env-changed=TINO_DATA_CHANNEL");
    tauri_build::build()
}
