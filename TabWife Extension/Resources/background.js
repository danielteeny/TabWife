// background.js - Background service for tab monitoring

let userSettings = {};
let duplicateCache = new Set();

// Load settings
async function loadSettings() {
  const result = await browser.storage.sync.get({
    matchMode: 'fullpath',
    autoDetect: true,
    keepNewest: true,
    notifyDuplicates: true,
    autoOrganizeTabs: true
  });
  userSettings = result;
  console.log('Settings loaded:', userSettings);
}

// Initialize settings immediately on script load (not just on install)
loadSettings();

// Initialize background script
browser.runtime.onInstalled.addListener(async () => {
  console.log('TabWife installed');
  await loadSettings();
});

// Listen for settings changes
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    loadSettings();
  }
});

// Monitor tab updates (URL changes)
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only process when URL changes (means URL has loaded)
  if (changeInfo.url) {
    try {
      if (userSettings.autoDetect) {
        await checkForDuplicates(tab);
      }

      if (userSettings.autoOrganizeTabs) {
        await autoOrganizeTab(tab);
      }
    } catch (e) {
      console.error('Error processing tab update:', e);
    }
  }
});

// Check for duplicates when a tab is created or updated
async function checkForDuplicates(tab) {
  if (!tab.url || tab.url.startsWith('about:') || tab.url.startsWith('chrome:') || tab.url.startsWith('safari:')) {
    return;
  }

  const allTabs = await browser.tabs.query({});
  const duplicates = allTabs.filter(t => {
    if (t.id === tab.id) return false;
    return matchTabs(tab, t, userSettings.matchMode);
  });

  if (duplicates.length > 0 && !duplicateCache.has(tab.id)) {
    duplicateCache.add(tab.id);

    if (userSettings.notifyDuplicates) {
      // Note: Safari extensions have limited notification support
      // This will need to be handled through the popup or badge
      updateBadge(duplicates.length + 1);
    }
  }
}

// Update extension badge
function updateBadge(count) {
  if (count > 0) {
    browser.action.setBadgeText({ text: count.toString() });
    browser.action.setBadgeBackgroundColor({ color: '#ff3b30' });
  } else {
    browser.action.setBadgeText({ text: '' });
  }
}

// Auto-organize tab based on domain and keyword assignments
async function autoOrganizeTab(tab) {
  // Skip pinned tabs and special URLs
  if (tab.pinned || !tab.url || tab.url.startsWith('about:') || tab.url.startsWith('chrome:') || tab.url.startsWith('safari:')) {
    console.log('Skipping auto-organize for tab:', tab.url);
    return;
  }

  try {
    // Extract domain from tab URL
    const url = new URL(tab.url);
    const domain = getRootDomain(url.hostname);
    const domainKey = url.port ? `${domain}:${url.port}` : domain;

    console.log(`Checking auto-organize for tab ${tab.id}: ${tab.url}, domain: ${domainKey}`);

    // Load all domain and keyword assignments
    const result = await browser.storage.local.get(['windowDomains', 'windowKeywords']);
    const allDomainAssignments = result.windowDomains || {};
    const allKeywordAssignments = result.windowKeywords || {};

    console.log('Domain assignments:', allDomainAssignments);
    console.log('Keyword assignments:', allKeywordAssignments);

    let assignedWindowId = null;

    // First, check domain assignments
    for (const windowId in allDomainAssignments) {
      const domains = allDomainAssignments[windowId];
      if (domains.includes(domainKey)) {
        assignedWindowId = parseInt(windowId);
        console.log(`Found domain match! Window ${assignedWindowId} is assigned to ${domainKey}`);
        break;
      }
    }

    // If no domain match, check keyword assignments
    if (!assignedWindowId) {
      const tabUrl = tab.url.toLowerCase();
      const tabTitle = (tab.title || '').toLowerCase();
      const tabDomain = url.hostname.toLowerCase();

      for (const windowId in allKeywordAssignments) {
        const keywords = allKeywordAssignments[windowId];
        for (const keyword of keywords) {
          const keywordLower = keyword.toLowerCase();
          // Check if keyword appears in URL, title, or domain
          if (tabUrl.includes(keywordLower) || tabTitle.includes(keywordLower) || tabDomain.includes(keywordLower)) {
            assignedWindowId = parseInt(windowId);
            console.log(`Tab matched keyword "${keyword}": ${tab.title}`);
            break;
          }
        }
        if (assignedWindowId) break;
      }
    }

    // If assigned (by domain or keyword) and tab is not in the assigned window, move it
    if (assignedWindowId && tab.windowId !== assignedWindowId) {
      // Verify the target window still exists before attempting to move
      try {
        const targetWindow = await browser.windows.get(assignedWindowId);
        if (!targetWindow) {
          console.log(`Target window ${assignedWindowId} no longer exists, skipping auto-organize`);
          return;
        }

        console.log(`Auto-organizing tab ${tab.id} to window ${assignedWindowId}`);

        // If the tab was active (user is looking at it), make it active in the new window and focus that window
        const shouldActivate = tab.active;

        // Safari workaround: create new tab in target window, then close original
        const newTab = await browser.tabs.create({
          windowId: assignedWindowId,
          url: tab.url,
          active: shouldActivate
        });

        // If the original tab was active, focus the target window
        if (shouldActivate) {
          await browser.windows.update(assignedWindowId, { focused: true });
          console.log(`Switched focus to window ${assignedWindowId} for active tab`);
        }

        await browser.tabs.remove(tab.id);
      } catch (windowError) {
        console.error(`Target window ${assignedWindowId} no longer exists or is inaccessible:`, windowError);

        // Clean up stale window assignments
        console.log(`Attempting to clean up assignments for window ${assignedWindowId}`);
        console.log(`Has domain assignments:`, !!allDomainAssignments[assignedWindowId]);
        console.log(`Has keyword assignments:`, !!allKeywordAssignments[assignedWindowId]);

        if (allDomainAssignments[assignedWindowId]) {
          console.log(`Deleting domain assignments:`, allDomainAssignments[assignedWindowId]);
          delete allDomainAssignments[assignedWindowId];
          await browser.storage.local.set({ windowDomains: allDomainAssignments });
          console.log(`Removed stale domain assignments for window ${assignedWindowId}`);
        }

        if (allKeywordAssignments[assignedWindowId]) {
          console.log(`Deleting keyword assignments:`, allKeywordAssignments[assignedWindowId]);
          delete allKeywordAssignments[assignedWindowId];
          await browser.storage.local.set({ windowKeywords: allKeywordAssignments });
          console.log(`Removed stale keyword assignments for window ${assignedWindowId}`);
        }
      }
    }
  } catch (e) {
    console.error('Error auto-organizing tab:', e);
  }
}

// Get root domain from hostname (simplified version for background.js)
function getRootDomain(hostname) {
  // For IP addresses or localhost, return as-is
  if (isIPAddress(hostname)) {
    return hostname;
  }

  // For domain names, extract root domain
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join('.');
}

// Check if hostname is an IP address
function isIPAddress(hostname) {
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv4Pattern.test(hostname) || ipv6Pattern.test(hostname) || hostname === 'localhost';
}

// Match tabs based on mode
function matchTabs(tab1, tab2, mode) {
  try {
    const url1 = new URL(tab1.url);
    const url2 = new URL(tab2.url);

    switch (mode) {
      case 'exact':
        return tab1.url === tab2.url;

      case 'domain':
        return url1.hostname === url2.hostname;

      case 'subdomain':
        return url1.host === url2.host;

      case 'path':
        return url1.hostname === url2.hostname && url1.pathname === url2.pathname;

      default:
        return url1.hostname === url2.hostname;
    }
  } catch (e) {
    return false;
  }
}

// Listen for messages from popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getDuplicates') {
    getDuplicateCount().then(sendResponse);
    return true;
  }
});

// Get current duplicate count
async function getDuplicateCount() {
  const tabs = await browser.tabs.query({});
  const duplicates = new Set();

  tabs.forEach((tab, index) => {
    tabs.slice(index + 1).forEach(otherTab => {
      if (matchTabs(tab, otherTab, userSettings.matchMode)) {
        duplicates.add(otherTab.id);
      }
    });
  });

  return duplicates.size;
}

// Clear duplicate cache when tabs are removed
browser.tabs.onRemoved.addListener((tabId) => {
  duplicateCache.delete(tabId);
});

// Clean up window assignments when windows are closed
browser.windows.onRemoved.addListener(async (windowId) => {
  try {
    const result = await browser.storage.local.get(['windowDomains', 'windowKeywords', 'windowNicknames']);

    // Remove this window's assignments
    if (result.windowDomains && result.windowDomains[windowId]) {
      delete result.windowDomains[windowId];
      await browser.storage.local.set({ windowDomains: result.windowDomains });
      console.log(`Cleaned up domain assignments for closed window ${windowId}`);
    }

    if (result.windowKeywords && result.windowKeywords[windowId]) {
      delete result.windowKeywords[windowId];
      await browser.storage.local.set({ windowKeywords: result.windowKeywords });
      console.log(`Cleaned up keyword assignments for closed window ${windowId}`);
    }

    if (result.windowNicknames && result.windowNicknames[windowId]) {
      delete result.windowNicknames[windowId];
      await browser.storage.local.set({ windowNicknames: result.windowNicknames });
      console.log(`Cleaned up nickname for closed window ${windowId}`);
    }
  } catch (e) {
    console.error('Error cleaning up window assignments:', e);
  }
});
