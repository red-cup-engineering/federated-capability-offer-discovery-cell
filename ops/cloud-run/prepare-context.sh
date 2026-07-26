#!/usr/bin/env bash
set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$script_dir
while [[ ! -d "$repo_root/lib/emsenn/services" ]]; do
  parent=$(dirname -- "$repo_root")
  if [[ "$parent" == "$repo_root" ]]; then
    echo "could not locate the services workspace above $script_dir" >&2
    exit 66
  fi
  repo_root=$parent
done

context_dir=${1:-}
if [[ -z "$context_dir" || "$context_dir" != /tmp/* ]]; then
  echo "usage: $0 /tmp/exact-build-context" >&2
  exit 64
fi
mkdir -p "$context_dir"

package_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)
while IFS= read -r -d '' source; do
  relative=${source#"$repo_root/"}
  target="$context_dir/$relative"
  mkdir -p "$target"
  tar --exclude='./node_modules' --exclude='./data' --exclude='./.git' \
    -C "$source" -cf - . | tar -C "$target" -xf -
done < <(node --input-type=module -e '
  import fs from "node:fs";
  import path from "node:path";
  const queue = [path.resolve(process.argv[1])];
  const seen = new Set();
  while (queue.length) {
    const directory = queue.shift();
    if (seen.has(directory)) continue;
    seen.add(directory);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
    for (const value of Object.values({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
      if (typeof value === "string" && value.startsWith("file:")) queue.push(path.resolve(directory, value.slice(5)));
    }
  }
  for (const directory of seen) process.stdout.write(`${directory}\0`);
' "$package_root")

cp "$script_dir/Dockerfile" "$context_dir/Dockerfile"
cp "$script_dir/cloudbuild.yaml" "$context_dir/cloudbuild.yaml"
printf '%s\n' "$context_dir"
