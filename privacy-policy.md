# Privacy Policy for BookmarkHero

**Effective Date:** 2026-03-30

Thank you for choosing BookmarkHero ("we", "our", or "us"). We are committed to protecting your privacy and ensuring transparency in how your data is handled. This Privacy Policy outlines our practices regarding data collection, usage, and security for the BookmarkHero Chrome Extension.

## 1. Information We Collect

### A. Personal Information
**We do NOT collect, store, or transmit any personally identifiable information (PII).** You do not need to create an account or provide any personal details to use BookmarkHero.

### B. Bookmark Data
BookmarkHero requests the `bookmarks` permission to read, organize, and manage your browser's bookmarks. 
- **Local Processing Only:** All analysis (such as detecting dead links, finding duplicates, and identifying empty folders) is performed entirely **locally** within your browser. 
- **No Data Transmission:** We do **not** upload your bookmarks, folder structures, or any derived data to our servers or any third-party servers.

### C. Network Requests for Dead Link Detection
To verify if a saved bookmark is still active (dead link scanner), the extension must make brief HTTP network requests to the URLs in your bookmarks.
- We utilize HTTP `HEAD` or truncated `GET` requests strictly to read the server's HTTP status code.
- No user context, cookies, or personal tracking identifiers are attached to these requests.

## 2. Permissions Used and Why

BookmarkHero requests the minimum permissions necessary to function:
- **`bookmarks`**: Required to read your bookmark tree, find duplicates, clean empty folders, and allow you to remove dead links.
- **`storage`** (`chrome.storage.local`): Used exclusively to save your extension preferences (e.g., scanner concurrency limits) and operation logs (your undo history) locally on your device.
- **`sidePanel`**: Required to provide a seamless side-panel user interface for quick access to the tools.
- **`<all_urls>`** (Host Permission): Required to perform the HTTP network requests that check if your bookmarked websites are still online and accessible.

## 3. Data Sharing and Disclosure

Because we do not collect your data, we cannot and do not sell, rent, or share your data with any third parties, advertisers, or analytics platforms.

## 4. Changes to This Privacy Policy

We may update this Privacy Policy from time to time. If we make significant changes, we will notify you by updating the "Effective Date" at the top of this policy and, if required, requesting your consent again within the extension.

## 5. Contact Us

If you have any questions or concerns about this Privacy Policy or our data practices, please create an Issue on our GitHub repository:
[https://github.com/lyon/BookmarkHero](https://github.com/lyon/BookmarkHero)
