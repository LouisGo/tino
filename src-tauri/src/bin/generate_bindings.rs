fn main() {
    tino_lib::ipc_schema::export_typescript_bindings()
        .expect("failed to export TypeScript bindings");
}
