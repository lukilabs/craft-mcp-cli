# Production Readiness Review

## Summary

This document tracks the production readiness review for Craft MCP CLI documentation. The project is a forked/adjusted version of the general MCP CLI, specifically tailored for Craft documents.

## ✅ Updated Documentation (Craft-Specific)

The following documentation files have been updated to reflect the Craft fork:

1. **`cli-reference.md`** - ✅ Updated with `craft` commands and Craft-specific context
2. **`config.md`** - ✅ Completely rewritten for Craft-specific configuration (`~/.craft/config.json`)
3. **`mcp.md`** - ✅ Updated to clarify this is a Craft-focused fork
4. **`spec.md`** - ✅ Updated roadmap and goals for Craft-specific deliverables
5. **`adhoc.md`** - ✅ Updated with `craft` commands and Craft URL examples
6. **`tool-calling.md`** - ✅ Updated with Craft-specific examples
7. **`cli-generator.md`** - ✅ Updated to note potential feature status

## ⚠️ Documentation Requiring Updates

The following files still contain references to the original "mcporter" system and need updates:

### High Priority (User-Facing)

1. **`migration.md`** - References `mcporter` package, `config/mcporter.json`, `~/.mcporter/`
   - **Action**: Update to Craft-specific migration guide OR mark as legacy/not applicable
   - **Status**: Needs decision on relevance for Craft fork

2. **`pnpm-mcp-migration.md`** - References `mcporter` CLI
   - **Action**: Update to `craft` commands OR mark as legacy
   - **Status**: Likely not applicable for Craft fork

3. **`local.md`** - References `mcporter` commands and `MCPORTER_*` env vars
   - **Action**: Update to `craft` commands and `CRAFT_*` env vars (if applicable)
   - **Status**: Development docs, should be updated

4. **`tmux.md`** - References `mcporter` commands and `MCPORTER_*` env vars
   - **Action**: Update to `craft` commands
   - **Status**: Development/debugging docs, should be updated

5. **`emit-ts.md`** - References `mcporter emit-ts` command
   - **Action**: Update to `craft emit-ts` OR mark as not implemented
   - **Status**: Check if feature exists in Craft fork

### Medium Priority (Internal/Development)

6. **`hang-debug.md`** - References `mcporter` and `MCPORTER_*` env vars
   - **Action**: Update to `craft` commands
   - **Status**: Development docs, should be updated

7. **`manual-testing.md`** - References `mcporter`
   - **Action**: Update to `craft` commands
   - **Status**: Development docs, should be updated

8. **`known-issues.md`** - References `mcporter` and general MCP server issues
   - **Action**: Update to Craft-specific issues OR mark as legacy
   - **Status**: May contain Craft-relevant issues

9. **`supabase-auth-issue.md`** - References `mcporter` and Supabase OAuth
   - **Action**: Update to `craft` OR mark as not applicable (Craft-specific)
   - **Status**: May not be relevant for Craft fork

10. **`oauth-implementation.md`** - References `MCPORTER_*` env vars
    - **Action**: Update env var names if different in Craft fork
    - **Status**: Implementation docs, check if env vars differ

### Low Priority (May Not Apply)

11. **`import.md`** - References `config/mcporter.json` and editor config imports
    - **Action**: Determine if Craft fork supports config imports
    - **Status**: May not be applicable (Craft uses `~/.craft/config.json`)

12. **`refactor.md`** - Internal refactoring notes
    - **Action**: Review for relevance
    - **Status**: Internal docs, may be outdated

13. **`call-heuristic.md`** - Command inference logic
    - **Action**: Review for Craft-specific behavior
    - **Status**: Implementation docs

14. **`call-syntax.md`** - Command syntax documentation
    - **Action**: Review for Craft-specific syntax
    - **Status**: Implementation docs

15. **`completion-implementation.md`** - Shell completion
    - **Action**: Review for Craft commands
    - **Status**: Implementation docs

16. **`health-check-implementation.md`** - Health check feature
    - **Action**: Review for Craft-specific implementation
    - **Status**: Implementation docs

17. **`subagent.md`** - Subagent feature
    - **Action**: Review for relevance
    - **Status**: Feature docs

## 🔍 Remaining Issues Found

### Path References
- `~/.mcporter/` → Should be `~/.craft/` (fixed in spec.md, but check others)
- `config/mcporter.json` → Should be `~/.craft/config.json` (fixed in config.md)

### Command References
- `mcporter` → Should be `craft` (partially fixed)
- `npx mcporter` → Should be `npx craft-mcp-cli` or `craft` (if installed globally)

### Environment Variables
- `MCPORTER_*` → Should be `CRAFT_*` (if applicable, check implementation)

### Package References
- `mcporter` package → Should be `craft-mcp-cli`

## 📋 Recommended Actions

### Immediate (Before Production)

1. **Update user-facing docs** (`migration.md`, `local.md`, `tmux.md`)
2. **Fix all path references** (`~/.mcporter/` → `~/.craft/`)
3. **Update command examples** (`mcporter` → `craft`)
4. **Review feature relevance** - Determine which features from original fork exist in Craft fork

### Short-term

1. **Review implementation docs** for Craft-specific behavior
2. **Update environment variable names** if they differ
3. **Mark legacy docs** that don't apply to Craft fork
4. **Add Craft-specific examples** throughout

### Long-term

1. **Audit all docs** for consistency
2. **Create Craft-specific migration guide** if needed
3. **Document Craft-specific features** that differ from original fork
4. **Remove or archive** docs that don't apply to Craft fork

## ✅ Verification Checklist

- [ ] All `mcporter` → `craft` replacements complete
- [ ] All `~/.mcporter/` → `~/.craft/` replacements complete
- [ ] All `config/mcporter.json` → `~/.craft/config.json` replacements complete
- [ ] All command examples use `craft` instead of `mcporter`
- [ ] Environment variables updated (if applicable)
- [ ] Package references updated to `craft-mcp-cli`
- [ ] Legacy/irrelevant docs marked or removed
- [ ] Craft-specific features documented
- [ ] All links and cross-references updated
- [ ] README.md reviewed and updated (separate file)

## Notes

- Some docs may be intentionally kept as-is if they document internal implementation details
- Development/debugging docs should be updated but are lower priority than user-facing docs
- Consider creating a `LEGACY.md` or `ARCHIVE.md` for docs that don't apply to the Craft fork

