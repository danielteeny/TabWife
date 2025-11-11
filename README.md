# TabWrangler

A powerful Safari extension for organizing and managing browser tabs. TabWrangler helps you find and close duplicate tabs, organize tabs by domain, and save/restore browsing sessions.

## Features

### 🔍 Duplicate Detection
- **Smart Matching**: Multiple match modes to identify duplicate tabs
- **IP Address Support**: Properly handles IPv4, IPv6, and localhost addresses
- **Port-Based Matching**: Distinguishes between services on different ports (e.g., `192.168.1.100:8080` vs `192.168.1.100:3000`)
- **Auto-Detection**: Automatically detects duplicates as you browse
- **Flexible Options**: Choose to keep the newest or oldest duplicate

### 📁 Tab Organization
- **Group by Domain**: Organize tabs by their root domain
- **Reorder Tabs**: Automatically reorder tabs by domain for better organization
- **Scope Control**: Work with current window or all windows

### 💾 Session Management
- **Save Sessions**: Save your current tab configuration with a custom name
- **Restore Sessions**: Quickly restore previously saved sessions
- **Session History**: View all saved sessions with timestamps

### ⚙️ Customizable Match Modes

TabWrangler offers six different match modes to suit your needs:

1. **Exact URL** - Complete URL must match exactly
2. **Full Path** (default) - Host + port + path + query parameters
   - Perfect for self-hosted services with different paths/params
   - Example: `example.com:8080/app?user=1` ≠ `example.com:8080/app?user=2`
3. **Path Only** - Host + port + path (ignores query parameters)
   - Example: `example.com:8080/app?user=1` = `example.com:8080/app?user=2`
4. **Host + Port** - Matches hostname and port only
   - Perfect for self-hosted services
   - Example: `192.168.1.100:8080` ≠ `192.168.1.100:3000`
5. **Subdomain** - Exact subdomain match
   - Example: `app.example.com` ≠ `www.example.com`
6. **Domain Only** - Root domain match
   - Example: `app.example.com` = `www.example.com`

## Installation

### Requirements
- macOS 14.0 or later
- Safari 14.0 or later
- Xcode 15.0 or later (for building from source)

### Building from Source

1. Clone the repository:
   ```bash
   git clone https://github.com/danielteeny/TabWrangler.git
   cd TabWrangler
   ```

2. Open the project in Xcode:
   ```bash
   open TabWrangler.xcodeproj
   ```

3. Build and run the project in Xcode (⌘R)

4. Enable the extension in Safari:
   - Open Safari Preferences (⌘,)
   - Go to the "Extensions" tab
   - Enable "TabWrangler"
   - Grant necessary permissions when prompted

## Usage

### Accessing TabWrangler

Click the TabWrangler icon in Safari's toolbar to open the popup interface.

### Finding Duplicates

1. Click **"Find Duplicates"** to scan for duplicate tabs
2. Review the list of duplicate groups
3. Click **"Close Duplicates"** to remove duplicates (keeping one tab per group)

### Organizing Tabs

- **Group by Domain**: Analyzes and groups tabs by domain (results shown in console)
- **Reorder by Domain**: Physically reorders tabs in the current window by domain

### Managing Sessions

1. **Save Session**: Click "Save Current Session" and enter a name
2. **Restore Session**: Click "Restore Session" and select from saved sessions

### Settings

All settings are accessible directly from the popup:

- **Match Mode**: Choose how duplicates are identified
- **Keep Newest**: When enabled, keeps the most recently opened duplicate
- **Auto-detect**: Automatically detect duplicates as you browse

Settings are automatically saved when changed.

## Project Structure

```
TabWrangler/
├── TabWrangler/                    # Main macOS app wrapper
│   ├── AppDelegate.swift          # App lifecycle management
│   ├── ViewController.swift       # Main view controller
│   └── Resources/                 # App resources
│
├── TabWrangler Extension/         # Safari extension
│   ├── SafariWebExtensionHandler.swift  # Native message handler
│   └── Resources/
│       ├── manifest.json          # Extension manifest
│       ├── background.js          # Background service worker
│       ├── popup/
│       │   ├── popup.html         # Popup UI
│       │   ├── popup.js           # Popup logic
│       │   └── popup.css          # Popup styles
│       ├── options/
│       │   ├── options.html       # Options page
│       │   └── options.js        # Options logic
│       └── utils/
│           └── tabUtils.js        # Tab matching utilities
│
└── TabWrangler.xcodeproj/         # Xcode project
```

## Technical Details

### Extension Architecture

- **Manifest V3**: Uses the latest Safari extension format
- **Background Service**: Monitors tab creation and updates
- **Storage**: Uses `browser.storage.sync` for settings and `browser.storage.local` for sessions
- **Permissions**: Requires `tabs` and `storage` permissions

### Key Features Implementation

#### IP Address Handling
- Properly detects IPv4, IPv6, and localhost
- Treats IP addresses as complete addresses (no incorrect grouping)
- Example: `192.168.1.100` and `192.168.2.100` are correctly treated as different

#### Port-Based Matching
- All match modes consider ports when matching
- Essential for self-hosted services running on different ports
- Default ports (80, 443) are handled correctly

#### Match Mode Logic
- `tabUtils.js` contains the core matching algorithms
- Supports complex URL parsing and comparison
- Handles edge cases like invalid URLs gracefully

## Development

### Code Structure

- **`background.js`**: Handles tab monitoring and duplicate detection
- **`popup.js`**: Manages UI interactions and user actions
- **`tabUtils.js`**: Core utility functions for tab matching and grouping
- **`popup.html`**: Main user interface
- **`popup.css`**: Styling for the popup interface

### Adding New Features

1. Extension logic: Edit files in `TabWrangler Extension/Resources/`
2. Native functionality: Edit `SafariWebExtensionHandler.swift`
3. UI changes: Modify `popup.html`, `popup.js`, and `popup.css`

### Testing

1. Build and run in Xcode
2. Test in Safari with the extension enabled
3. Use Safari's Web Inspector for debugging (Develop → Show Web Inspector)

## License

This project is open source. See the repository for license details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

Created by Daniel Teeny

## Support

For issues, feature requests, or questions, please open an issue on GitHub.

---

**Note**: This extension requires Safari 14.0+ and macOS 14.0+ due to Safari Web Extension API requirements.

