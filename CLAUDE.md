# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

TabWife is a Safari Web Extension (Manifest V3) for macOS that manages browser tabs through duplicate detection, domain-based organization, and session management. It consists of two components: a native macOS wrapper app (required by Safari) and the actual web extension.

## Build & Development

### Building from Source
```bash
# Open in Xcode
open TabWife.xcodeproj

# Build and run (⌘R in Xcode)
# Extension auto-enables in Safari on first launch
```

### Development Workflow

**For Extension Changes** (JavaScript, HTML, CSS, manifest.json):
- Edit files in `TabWife Extension/Resources/`
- Use Safari → Develop → Add Temporary Extension for fast iteration
- Changes visible immediately after reload (no Xcode rebuild needed)
- Access Web Inspector: Safari → Develop → inspect background.js or popup

**For Native App Changes** (Swift files):
- Modify files in `TabWife/`
- Requires rebuild: ⌘R in Xcode

### Testing
- Use Safari's Web Inspector for JavaScript debugging
- `console.log()` in popup.js visible in Web Inspector
- Swift logging: `os_log()` in SafariWebExtensionHandler

## Architecture

### Dual-Component System

TabWife follows Safari's required architecture:

1. **Native macOS App** (`TabWife/`) - Wrapper container
   - Purpose: Extension lifecycle, preference bridge, distribution/signing
   - Key files: `AppDelegate.swift`, `ViewController.swift`, `Main.html`
   - User sees this when opening the app (shows extension status)

2. **Web Extension** (`TabWife Extension/Resources/`) - Actual functionality
   - Service worker: `background.js` (tab monitoring, duplicate detection)
   - Popup UI: `popup.html`, `popup.js`, `popup.css`
   - Shared utilities: `utils/tabUtils.js`
   - Configuration: `manifest.json`

### Data Flow

```
Tab Events (creation/update)
    ↓
background.js (service worker)
    • Monitors tabs
    • Detects duplicates (1s delay for URL loading)
    • Updates badge count
    • Filters special URLs (about:*, chrome:*, safari:*)
    ↓
User clicks popup icon
    ↓
popup.js loads
    • Reads settings from browser.storage.sync
    • Queries tabs via browser.tabs API
    • Calls tabUtils.js for matching/grouping
    • Renders UI with duplicate groups
```

### Storage Strategy

- **browser.storage.sync**: Settings (matchDomain, matchSubdomain, matchPort, matchPath, matchQuery, matchHash, keepNewest, consolidationThreshold, persistWindowConfig, autoOrganizeTabs)
  - Syncs across Safari instances
  - Limited to ~10MB
- **browser.storage.local**: Window configurations (windowDomains, windowKeywords, windowNicknames), sessions, UI state (activeTab)
  - Local-only, not synced
  - Larger quota
  - Window configs are automatically cleaned up when windows close
  - activeTab: Persists which tab (duplicates/organization) was last viewed

## Safari-Specific Limitations & Workarounds

### Critical: Cross-Window Tab Movement

**Problem**: Safari doesn't support `browser.tabs.move(tabId, {windowId})`

**Workaround** (used throughout codebase):
```javascript
// Preserve active state for smart focus behavior
const shouldActivate = tab.active;

// Create new tab in target window
await browser.tabs.create({
  windowId: targetWindowId,
  url: tab.url,
  active: shouldActivate  // true if user was viewing it, false for background tabs
});

// Switch focus if the original tab was active
if (shouldActivate) {
  await browser.windows.update(targetWindowId, { focused: true });
}

// Remove original tab
await browser.tabs.remove(originalTabId);
```

**Side Effects**:
- Page reloads completely
- Lost: scroll position, form data, history, session storage
- One-time warning dialog exists (currently disabled for testing)

**Focus Behavior**:
- Active tabs (user viewing): window switches focus automatically - keeps user engaged with their work
- Background tabs (bulk operations): no focus switch - prevents jarring interruptions

### Other Safari Limitations

- No `browser.tabGroups` API - cannot see or manipulate Safari's native tab groups
- No `groupId` property in tab objects
- Limited `browser.notifications` API - uses badge + alert() instead
- Pinned tabs must be manually filtered (`!tab.pinned`) in all operations
- Manifest V3: Use `browser.action` not `browser.browserAction` for badge operations
- Background scripts can be unloaded/reloaded by Safari - always load settings at top level, not just in `onInstalled`

## Core Components

### tabUtils.js - Shared Utility Library

**Key Functions**:

| Function | Purpose |
|----------|---------|
| `findDuplicates(tabs, matchMode, keepNewest)` | Groups tabs by match criteria, returns grouped duplicates + count |
| `matchTabs(tab1, tab2, mode)` | Compares two tabs using one of 6 match modes |
| `getRootDomain(hostname)` | **IP-aware**: Returns full IP for IPv4/IPv6/localhost; extracts root domain for hostnames |
| `groupByDomain(tabs)` | Groups tabs by domain (key format: `domain:port` if non-default port) |
| `generateConsolidationSuggestions(windows, threshold)` | Prioritizes assigned domains, then keyword matches, then unassigned domains meeting threshold |
| `analyzeDomainDistribution(windows)` | Maps tab distribution across windows for each domain |
| `getWindowNickname(windowId)` | Retrieves custom nickname from storage |
| `getWindowDomains(windowId)` | Retrieves assigned domains array from storage |
| `formatWindowDisplay(windowId)` | Returns nickname or "Window {id}" |
| `getAllDomains(windows)` | Returns sorted array of all unique domains (excludes pinned tabs) |

**Match System** (checkbox-based, flexible matching):

Users build custom match criteria by checking which components must match:
- `matchDomain` - Root domain (e.g., example.com)
- `matchSubdomain` - Full hostname including subdomain (e.g., www vs app)
- `matchPort` - Port number (e.g., :8080 vs :3000)
- `matchPath` - URL path (e.g., /page1 vs /page2)
- `matchQuery` - Query parameters (e.g., ?id=1 vs ?id=2)
- `matchHash` - Hash fragment (e.g., #section1 vs #section2)

**Presets** (applied via buttons in UI):
1. **Relaxed** - Only domain must match (collapses all subdomains, ports, paths)
2. **Normal** (DEFAULT) - Domain + subdomain + port + path + query (like old "fullpath")
3. **Strict** - Everything including hash

**Implementation**: `matchTabs()` checks each enabled flag. All enabled checks must pass for tabs to match.

**IP Address Handling** (`tabUtils.js:82-85`):
- Special case: IP addresses (IPv4/IPv6/localhost) returned as-is
- Prevents incorrect grouping: `192.168.1.100` ≠ `192.168.2.100`
- Critical for self-hosted services

### popup.js - UI Controller

**UI Structure**:
- **Two-tab interface**: Duplicates tab and Organization tab
  - Tab switching persists via `browser.storage.local.activeTab`
  - Each tab has its own relevant settings and actions
  - Duplicates tab: Match mode, keep newest, scope selector, duplicate detection
  - Organization tab: Consolidation, window management, session management

**State Management**:
- `currentScope`: 'current' (active window) or 'all' (all windows)
- `userSettings`: Loaded from `browser.storage.sync` with defaults

**Performance Optimization**:
- `updateStats()` shows tab count immediately, displays spinner while duplicates calculate
- Duplicate results cached and passed to `updateDuplicatesList()` to avoid double computation
- With 500+ tabs, perceived load time dramatically improved

**Critical Functions**:

| Function | Notes |
|----------|-------|
| `switchTab(tabName)` | Switches between 'duplicates' and 'organization' tabs, persists choice to storage |
| `updateStats()` | Shows tab count immediately, spinner for duplicates, caches results |
| `updateDuplicatesList(cachedDuplicates)` | **XSS-protected**: All user data passed through `escapeHtml()`. Accepts optional cached duplicates to avoid recomputation |
| `closeDuplicates()` | Respects `keepNewest` setting, shows confirmation |
| `getTabs()` | **Always excludes pinned tabs**: `!tab.pinned` |
| `smartOrganize()` | Uses Safari workaround (create + remove) for tab movement |
| `moveSelectedTabs()` / `moveAllTabs()` | Multi-window consolidation via workaround |
| `loadWindowManagement()` | Renders unified tag-based UI for domains and keywords |
| `organizeExistingTabs(targetWindowId)` | Immediately moves all existing tabs matching assigned domains/keywords to target window (background operation) |
| `saveWindowNickname()` / `saveWindowDomains()` / `saveWindowKeywords()` | Persist window configurations to `browser.storage.local` |
| `getWindowKeywords(windowId)` | Retrieves assigned keywords array from storage |

**XSS Protection** (lines 31-35):
```javascript
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;  // Uses textContent, not innerHTML
  return div.innerHTML;    // Returns safe HTML
}
```
All URLs and titles passed through this function.

### background.js - Service Worker

**Key Behaviors**:
- **Settings loaded on startup**: `loadSettings()` called immediately to ensure settings are available even if Safari reloads the background script
- **Always auto-detects duplicates**: No gatekeeper setting - always checks for duplicates and updates badge
- Monitors `browser.tabs.onUpdated` - processes when URL changes (no delay needed, URL already loaded)
- Maintains `duplicateCache` Set to prevent duplicate notifications
- Filters special URLs: `about:*`, `chrome:*`, `safari:*`
- Updates badge with duplicate count via `browser.action.setBadgeText()` (Manifest V3)
- Only loads `autoOrganizeTabs` setting (other settings handled by popup)

**Auto-Organization** (`autoOrganizeTab()`):
- Checks domain assignments first, then keyword assignments
- Validates target window exists before moving tabs
- Automatically cleans up stale window assignments when detected
- **Focus behavior**: If tab was active (user is looking at it), switches focus to target window; background tabs move silently
- Listens to `browser.windows.onRemoved` to clean up assignments when windows close

**Performance**: No artificial delays - `onUpdated` fires when URL is already loaded, allowing immediate processing.

## Window Management & Auto-Organization

### Window Configuration System

**Storage** (`browser.storage.local`):
- `windowDomains`: Maps window ID → array of assigned domains (e.g., `{3416290: ["youtube.com", "netflix.com"]}`)
- `windowKeywords`: Maps window ID → array of keywords for topic-based matching (e.g., `{3416417: ["3d printing", "cad"]}`)
- `windowNicknames`: Maps window ID → custom nickname string

**Domain Assignment**:
- Domains shown as tags in "Manage Windows" UI
- Unassigned domains: gray tags, clickable to assign
- Assigned domains: blue tags with X button to unassign
- Domains sorted by tab count (most tabs first)
- Pinned tabs excluded from domain suggestions

**Keyword Assignment**:
- Keywords shown as yellow tags
- Match against tab URL, title, and domain (case-insensitive)
- Input field supports Enter key or Add button
- Use for topic-based organization (e.g., "machine learning", "recipes")

**Auto-Organization Behavior**:
- When tab created/updated, checks domain assignments first, then keyword assignments
- Active tabs (user is viewing): moves AND switches focus to target window
- Background tabs: moves silently without switching focus
- Manual assignment via UI (`organizeExistingTabs()`): moves all matching existing tabs immediately in background
- Stale window cleanup: automatically removes assignments when windows close or don't exist

### Smart Domain Consolidation

**Algorithm** (`tabUtils.js:generateConsolidationSuggestions()`):

Priority order:
1. **Assigned suggestions**: Domains assigned to specific windows (ignores threshold)
2. **Keyword suggestions**: Tabs matching keywords assigned to windows
3. **Unassigned suggestions**: Domains meeting threshold, suggesting window with most tabs

For unassigned:
- Analyze domain distribution across all windows
- For each domain, identify "home window" = window with most tabs for that domain
- Only suggest consolidation if home window has ≥ threshold tabs (default: 3)
- Collect "stray tabs" from other windows
- Sort by impact (most stray tabs first)

**User Controls**:
- Threshold slider (2-10 tabs) in settings section
- "Analyze Organization" - shows suggestions with checkboxes
- "Smart Organize" - one-click automatic consolidation
- Individual "Move Selected" / "Move All" buttons per domain
- "Manage Windows" - assign domains/keywords to specific windows

**UI Features**:
- Click tab titles → switches to that tab and focuses window
- Click window IDs → focuses that window
- Checkboxes per source window for selective moving
- Expandable groups with individual tab titles visible
- Inline nickname editing with edit icon
- Tag-based domain/keyword UI with hover-to-remove

## UI/UX Design Decisions

### Two-Tab Interface

**Rationale**: Original single-page popup became overwhelming with 8+ action buttons and mixed concerns (detection vs organization).

**Implementation**:
- Tab 1 (Duplicates): Scope selector, match settings, duplicate detection/closure
- Tab 2 (Organization): Window management, consolidation, session management
- Tab state persists via `browser.storage.local.activeTab`
- Each tab shows its own total tabs count

**Benefits**:
- Clear separation of concerns
- Reduced cognitive load
- Settings grouped by purpose
- Easier to navigate for users

### Progressive Loading

**Problem**: With 500+ tabs, duplicate detection is slow (~1-2 seconds). Users couldn't tell if popup was frozen or working.

**Solution**:
1. Show tab count immediately (fast query)
2. Display spinner (⏳) in duplicates count
3. Calculate duplicates asynchronously
4. Update count when ready
5. Cache results to avoid recomputation in updateDuplicatesList()

**Impact**: Perceived load time dramatically improved. User gets immediate feedback that extension is working.

### Auto-Detection Always Enabled

**Removed**: "Auto-detect duplicates" checkbox

**Rationale**:
- 95%+ users kept it enabled
- Added unnecessary complexity
- Badge is non-intrusive, so no downside to always detecting
- Simplified both UI and background script logic

## Important Implementation Details

### Pinned Tabs Are Always Excluded

Multiple locations enforce this:
- `popup.js:211` - `getTabs()` filters with `!tab.pinned`
- `popup.js:319` - Consolidation suggestions exclude pinned tabs
- Critical for preserving user-pinned important tabs

### Consolidation Threshold Logic

- User-configurable via slider (2-10 tabs)
- Prevents over-consolidation of small tab groups
- Only suggests moving tabs if target window meets threshold
- Stored in `browser.storage.sync` as `consolidationThreshold`

### Session Management

- Uses `browser.storage.local` (privacy-respecting, not synced)
- Sessions contain: timestamp, name, tab URLs
- Restoring creates new tabs in current window
- No automatic persistence across browser restarts

## Code Quality Standards

### Security
- **Always use `escapeHtml()`** for user-controlled data (URLs, titles)
- Never use `innerHTML` with unsanitized input
- Validate URLs before processing (`try/catch` around `new URL()`)

### Safari Compatibility
- Test all `browser.tabs.*` and `browser.windows.*` APIs in Safari first
- Document any workarounds with comments explaining the limitation
- Add warnings when features cause page reloads or state loss

### State Management
- Settings changes should trigger immediate UI updates
- Use `await` for all `browser.storage.*` and `browser.tabs.*` calls
- Handle promise rejections with `try/catch`

## Common Tasks

### Adding a New Match Mode

1. Add mode to `tabUtils.js:matchTabs()` switch statement
2. Add option to `popup.html` match mode dropdown
3. Add description to `popup.js:updateMatchModeDescription()`
4. Test with various URL patterns

### Modifying Duplicate Detection

1. Edit logic in `background.js` (for auto-detection)
2. Update `tabUtils.js:findDuplicates()` (for manual detection)
3. Ensure badge count updates correctly
4. Test with `duplicateCache` to prevent duplicate notifications

### Adding New UI Sections

1. Add HTML structure to `popup.html` (place results under action buttons)
2. Add styles to `popup.css`
3. Add event listeners in `popup.js` (use event delegation for dynamic content)
4. Update settings in `loadSettings()` / `saveSettings()` if needed

## Requirements

- macOS 14.0+ (Sonoma)
- Safari 14.0+
- Xcode 15.0+ (for building)
- Swift 5.9+ (implicit with Xcode 15)

## Project History

- Originally named "TabWrangler" - all references updated to "TabWife"
- Subtitle: "like a trad wife - it cleans up after you"
- Created by Daniel Teeny (11/10/25)
