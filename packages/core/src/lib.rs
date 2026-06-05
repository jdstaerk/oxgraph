pub mod visitor;
pub mod graph;

use oxc_allocator::Allocator;
use oxc_ast_visit::Visit;
use oxc_parser::Parser;
use oxc_span::SourceType;
use visitor::ImportVisitor;

pub use graph::{build_graph, Edge, Graph, GraphBuildError, GraphIssue, GraphIssueKind, Node, NodeKind, NodeStatus};

/// Parses a source string and extracts all import paths.
/// Returns a Vector of import strings or an error message if parsing fails.
pub fn extract_imports(file_path: &str, source_text: &str) -> Result<Vec<String>, String> {
    // 1. Initialize the memory arena
    let allocator = Allocator::default();

    // 2. Determine file type (TS, TSX, JS, etc.)
    let source_type = SourceType::from_path(file_path).unwrap_or_default();

    // 3. Parse to AST
    let ret = Parser::new(&allocator, source_text, source_type).parse();

    if !ret.errors.is_empty() {
        // Collect all error messages into a single string for the caller
        let error_msgs: Vec<String> = ret.errors.iter().map(|e| format!("{:?}", e)).collect();
        return Err(error_msgs.join("\n"));
    }

    // 4. Traverse the AST
    let mut visitor = ImportVisitor::new();
    visitor.visit_program(&ret.program);

    // 5. Return the extracted imports
    Ok(visitor.imports)
}
