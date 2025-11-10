# Publishing Guide

Complete guide for distributing `craft-mcp-cli` across multiple platforms.

## Pre-Publishing Checklist

- [ ] Update version in `package.json`
- [ ] Update `CHANGELOG.md` with release notes
- [ ] Run tests: `pnpm test`
- [ ] Run linting: `pnpm check`
- [ ] Build successfully: `pnpm build`
- [ ] Test binary: `pnpm build:bun && ./dist-bun/craft --version`

---

## 1. npm Registry (Primary Distribution)

### Initial Setup (One-time)

```bash
# Login to npm (requires npm account at npmjs.com)
npm login

# Verify login
npm whoami
```

### Publishing

```bash
# Dry run to preview what will be published
npm pack --dry-run

# Publish to npm
npm publish

# For beta/alpha releases
npm publish --tag beta
npm publish --tag alpha
```

### Post-Publish Verification

```bash
# Install globally and test
npm install -g craft-mcp-cli@latest
craft --version

# Or test with npx
npx craft-mcp-cli --version
```

### Version Management

```bash
# Bump patch version (1.0.0 -> 1.0.1)
npm version patch

# Bump minor version (1.0.0 -> 1.1.0)
npm version minor

# Bump major version (1.0.0 -> 2.0.0)
npm version major

# Custom version
npm version 1.2.3

# Then publish
git push --follow-tags && npm publish
```

---

## 2. Homebrew Distribution

### Option A: Homebrew Tap (Recommended)

**Create a tap repository:**

```bash
# Create new GitHub repo: homebrew-tap
gh repo create lukilabs/homebrew-tap --public
```

**Generate release binaries:**

```bash
# Build for Mac (ARM)
bun scripts/build-bun.ts --target bun-darwin-arm64 --output dist-bun/craft-darwin-arm64

# Build for Mac (Intel)
bun scripts/build-bun.ts --target bun-darwin-x64 --output dist-bun/craft-darwin-x64

# Build for Linux
bun scripts/build-bun.ts --target bun-linux-x64 --output dist-bun/craft-linux-x64

# Create archives
cd dist-bun
tar -czf craft-1.0.0-darwin-arm64.tar.gz craft-darwin-arm64
tar -czf craft-1.0.0-darwin-x64.tar.gz craft-darwin-x64
tar -czf craft-1.0.0-linux-x64.tar.gz craft-linux-x64
```

**Create GitHub release:**

```bash
# Tag and push
git tag v1.0.0
git push origin v1.0.0

# Create release with binaries
gh release create v1.0.0 \
  dist-bun/craft-1.0.0-darwin-arm64.tar.gz \
  dist-bun/craft-1.0.0-darwin-x64.tar.gz \
  dist-bun/craft-1.0.0-linux-x64.tar.gz \
  --title "v1.0.0" \
  --notes "Release notes here"
```

**Create Homebrew formula** (`homebrew-tap/Formula/craft.rb`):

```ruby
class Craft < Formula
  desc "CLI and SDK for Craft documents via Model Context Protocol"
  homepage "https://github.com/lukilabs/craft-mcp-cli"
  version "1.0.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/lukilabs/craft-mcp-cli/releases/download/v1.0.0/craft-1.0.0-darwin-arm64.tar.gz"
      sha256 "CHECKSUM_HERE"  # Run: shasum -a 256 craft-1.0.0-darwin-arm64.tar.gz
    else
      url "https://github.com/lukilabs/craft-mcp-cli/releases/download/v1.0.0/craft-1.0.0-darwin-x64.tar.gz"
      sha256 "CHECKSUM_HERE"  # Run: shasum -a 256 craft-1.0.0-darwin-x64.tar.gz
    end
  end

  on_linux do
    url "https://github.com/lukilabs/craft-mcp-cli/releases/download/v1.0.0/craft-1.0.0-linux-x64.tar.gz"
    sha256 "CHECKSUM_HERE"  # Run: shasum -a 256 craft-1.0.0-linux-x64.tar.gz
  end

  def install
    bin.install "craft-darwin-arm64" => "craft" if Hardware::CPU.arm? && OS.mac?
    bin.install "craft-darwin-x64" => "craft" if Hardware::CPU.intel? && OS.mac?
    bin.install "craft-linux-x64" => "craft" if OS.linux?
  end

  test do
    system "#{bin}/craft", "--version"
  end
end
```

**Users install with:**

```bash
brew tap lukilabs/tap
brew install craft
```

### Option B: Core Homebrew (For Popular Tools)

Submit a PR to [Homebrew/homebrew-core](https://github.com/Homebrew/homebrew-core) after the project gains traction.

---

## 3. Bun Registry (bunx support)

Bun automatically supports npm packages, so once published to npm:

```bash
# Users can run directly
bunx craft-mcp-cli --version

# Or install globally
bun add -g craft-mcp-cli
```

---

## 4. JSR (JavaScript Registry)

JSR provides better TypeScript support and auto-generated docs.

**Create `jsr.json`:**

```json
{
  "name": "@lukilabs/craft-mcp-cli",
  "version": "1.0.0",
  "exports": {
    ".": "./dist/sdk.js",
    "./cli": "./dist/cli.js"
  }
}
```

**Publish:**

```bash
# Install JSR CLI
npm install -g jsr

# Publish to JSR
jsr publish
```

**Users install:**

```bash
# Deno
deno add @lukilabs/craft-mcp-cli

# npm/pnpm/bun
npx jsr add @lukilabs/craft-mcp-cli
```

---

## 5. GitHub Releases (Standalone Binaries)

Already covered in Homebrew section above. Users can download binaries directly from:

```
https://github.com/lukilabs/craft-mcp-cli/releases/latest
```

---

## 6. Docker Distribution

**Create `Dockerfile`:**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist ./dist
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["--help"]
```

**Build and publish:**

```bash
# Build image
docker build -t lukilabs/craft-mcp-cli:1.0.0 .
docker tag lukilabs/craft-mcp-cli:1.0.0 lukilabs/craft-mcp-cli:latest

# Push to Docker Hub
docker push lukilabs/craft-mcp-cli:1.0.0
docker push lukilabs/craft-mcp-cli:latest

# Or use GitHub Container Registry
docker tag lukilabs/craft-mcp-cli:1.0.0 ghcr.io/lukilabs/craft-mcp-cli:1.0.0
docker push ghcr.io/lukilabs/craft-mcp-cli:1.0.0
```

**Users run:**

```bash
docker run lukilabs/craft-mcp-cli:latest --version
```

---

## 7. CI/CD Automation (Recommended)

Create `.github/workflows/release.yml` for automated releases:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  publish-npm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
      - run: pnpm install
      - run: pnpm build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  build-binaries:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: bun-darwin-arm64
            artifact: craft-darwin-arm64
          - os: macos-13  # Intel Mac
            target: bun-darwin-x64
            artifact: craft-darwin-x64
          - os: ubuntu-latest
            target: bun-linux-x64
            artifact: craft-linux-x64
          - os: windows-latest
            target: bun-windows-x64
            artifact: craft-windows-x64.exe
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun scripts/build-bun.ts --target ${{ matrix.target }} --output ${{ matrix.artifact }}
      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.artifact }}
          path: dist-bun/${{ matrix.artifact }}

  create-release:
    needs: [publish-npm, build-binaries]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
      - name: Create archives
        run: |
          tar -czf craft-${{ github.ref_name }}-darwin-arm64.tar.gz craft-darwin-arm64
          tar -czf craft-${{ github.ref_name }}-darwin-x64.tar.gz craft-darwin-x64
          tar -czf craft-${{ github.ref_name }}-linux-x64.tar.gz craft-linux-x64
          zip craft-${{ github.ref_name }}-windows-x64.zip craft-windows-x64.exe
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            craft-${{ github.ref_name }}-*.tar.gz
            craft-${{ github.ref_name }}-*.zip
          generate_release_notes: true
```

---

## Distribution Checklist

For each release:

- [ ] npm registry (for Node.js users)
- [ ] GitHub releases with binaries (for direct downloads)
- [ ] Update Homebrew formula (for Mac/Linux users)
- [ ] JSR (optional, for Deno users)
- [ ] Docker Hub (optional, for containerized environments)
- [ ] Announce on social media / Discord / etc.

---

## Quick Release Workflow

```bash
# 1. Update version and changelog
vim CHANGELOG.md
npm version 1.0.1

# 2. Push tags
git push --follow-tags

# 3. Publish to npm
npm publish

# 4. Build binaries for Homebrew
pnpm build:bun:all  # (create this script if needed)

# 5. Create GitHub release
gh release create v1.0.1 --generate-notes

# 6. Update Homebrew tap
# (Edit homebrew-tap/Formula/craft.rb with new version/checksums)
```

---

## Monitoring

**npm package stats:**
- https://npm-stat.com/charts.html?package=craft-mcp-cli
- https://npmjs.com/package/craft-mcp-cli

**Homebrew stats:**
- https://formulae.brew.sh/formula/craft (after submission to core)

**GitHub releases:**
- View download counts on releases page
