# Configurable editorial workflow

Each client's `social.workflow` has a mode (`rubrics`, `free`, `both`), independently configured rules, and a separate `freeRule`. Rules own material, social copy, art copy and artwork responsibilities, input quantity, text/art approvals, networks, shared/separate Facebook copy, language and editorial instructions.

Configuration changes increment a revision. New posts store an immutable-by-default snapshot in `workflow` plus source IDs and a source-content snapshot. Existing posts are left in their original flow. Configuration changes never migrate or invalidate existing post approvals automatically.

Materials use the existing client-scoped `clientIdeas` collection. Draft and ready states are explicit. Only ready, unused materials for the same client and type can be grouped. Inputs must match the selected rule's quantity exactly. Materials linked to a post become read-only source records. Files use the existing authenticated private file service, with matching `clientDocuments` entries so backups include them. File formats remain PDF, PNG and JPEG, up to 3 MB; other formats can be referenced by HTTPS links.

The existing authenticated workspace endpoint validates configuration and source associations through `lib/editorial-model.mjs`. Whole-workspace writes retain optimistic concurrency checks, transaction receipts and audit snapshots. The same rule logic is embedded in the browser bundle by the build script. Server validation independently rejects cross-client references, duplicate input usage, invalid configuration and premature approval submissions.

Art copy is part of text approval. Text changes reopen text review and invalidate submitted artwork review. Artwork cannot be submitted until text requirements are fulfilled. When approval is disabled for a type, the corresponding review columns indicate that approval is waived. “Ready to publish” is a workflow status, not evidence of publication on a social network.

## Current boundaries

The client portal is still an explicitly labelled internal preview. No external client access is granted by this change. AI generation, email notifications, social publishing and third-party integrations are not activated. Responsibility settings describe who performs each task; administrators may record material on someone's behalf.

Run `node --test tests/editorial.test.mjs` to verify configuration modes, per-type responsibilities, source grouping, snapshots, approval gates, tenant separation and the UI grouping callback.
