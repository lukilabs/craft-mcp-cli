#!/usr/bin/env tsx

/**
 * Example: fetch the README for a React-adjacent package from Context7
 * and print only the markdown headlines.
 */

import { createRuntime, createServerProxy } from "../src/index.ts";

async function main(): Promise<void> {
  const runtime = await createRuntime();
  const context7 = createServerProxy(runtime, "context7");
  try {
    const resolveResult = await context7.resolveLibraryId({ libraryName: "react" });
    const resultText = Array.isArray(resolveResult?.content)
      ? resolveResult.content
          .map((entry) =>
            entry && typeof entry === "object" && "text" in entry
              ? String(entry.text ?? "")
              : "",
          )
          .join("\n")
      : "";
    const idMatch = resultText.match(
      /Context7-compatible library ID:\s*([^\s]+)/,
    );
    const target = idMatch?.[1];
    if (!target) {
      console.error("No Context7-compatible library ID resolved for React.");
      return;
    }

    const docs = await context7.getLibraryDocs({ context7CompatibleLibraryID: target });
    const markdown = Array.isArray(docs?.content)
      ? docs.content
          .map((entry) =>
            entry && typeof entry === "object" && "text" in entry
              ? String(entry.text ?? "")
              : "",
          )
          .join("\n")
      : "";
    const headlines = markdown
      .split("\n")
      .filter((line) => /^#+\s/.test(line))
      .join("\n");

    console.log(`# Headlines for ${target}`);
    console.log(headlines || "(no headlines found)");
  } finally {
    await runtime.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
