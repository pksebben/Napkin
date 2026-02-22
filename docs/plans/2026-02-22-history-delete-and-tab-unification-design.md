# History Delete & Tab Unification

## History Delete

Add the ability to delete individual history snapshots from the history panel.

### Server

- `StateStore.deleteSnapshot(timestamp)` — removes entry from in-memory history array
- `DELETE /api/sessions/:name/history/:timestamp` endpoint in shared-server
- Re-persist session after delete (fire-and-forget, same as rollback)
- Broadcast `history_changed` so client refreshes

### Client

- Delete button on each history card in HistoryPanel
- Calls `DELETE /api/sessions/${sessionName}/history/${timestamp}`
- Refreshes via `history_changed` WebSocket event

### Edge case

Deleting the snapshot matching `currentDesign` leaves the canvas as-is. Delete only removes from history, not from the live canvas.

## Tab Unification

Replace the two-tab model ("My Draft" / "Claude's Revision") with a single unified canvas.

### Remove

- Tab switcher UI (My Draft / Claude's Revision buttons)
- `draftElementsRef` and `claudeElementsRef` separate element stores
- `switchTab` logic and `activeTab` / `activeTabRef` state

### Replace with

- Single Excalidraw canvas always showing the current design
- Source badge in toolbar showing who last updated: "Claude" or "You"
- Track `lastSource` state derived from the most recent action

### Behavior

- Claude sends `design_update` via WebSocket: canvas updates, badge shows "Claude"
- User clicks "Push to Claude": canvas state pushed, badge shows "You"
- User clicks "Restore" on history entry: canvas loads that snapshot, badge shows the snapshot's source
- New designs auto-show on the canvas (no click-to-load)
- History cards already show source badges, no change needed
