use clap::Parser;
use oxgraph_core::build_graph;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "oxgraph")]
#[command(about = "High-performance code dependency visualizer", long_about = None)]
struct CliArgs {
    /// The target file to analyze
    #[arg(short, long)]
    file: PathBuf,
}

fn main() {
    let args = CliArgs::parse();

    match build_graph(&args.file) {
        Ok(graph) => {
            let json_output = serde_json::to_string_pretty(&graph).unwrap();
            println!("{}", json_output);
        }
        Err(err) => {
            eprintln!("{}", err);
            std::process::exit(1);
        }
    }
}
