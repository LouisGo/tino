use std::io::{self, Read};

use tino_lib::ai_quality_replay::{compile_bundle, AiQualityReplayRequest};

fn main() {
    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .expect("failed to read replay request from stdin");

    let request = serde_json::from_str::<AiQualityReplayRequest>(&input)
        .expect("failed to parse replay request JSON");
    let response = compile_bundle(request).expect("failed to compile replay bundle");

    println!(
        "{}",
        serde_json::to_string_pretty(&response).expect("failed to serialize replay response"),
    );
}
