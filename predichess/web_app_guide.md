# Predichess Web Edition - Guide & Deployment Manual

Welcome to **Predichess Web Edition**! We have updated the web client to align 100% with the branding, naming, colors, texts, and button interfaces of your native Android Kotlin application.

Instead of heavy visual shapes and solid colors, the website now utilizes elegant, clean **Material Outlined Style** outlines for all buttons and text controls. Additionally, we corrected the branding across the entire site to match your official name: **Predichess**!

### Aligned Features:
1. **Name Alignment:** Changed all occurrences of "Delta Chess" to **Predichess** in both files and user guides.
2. **Material Outlined Buttons:** All login, request, and friend action buttons are outlines with transparent backgrounds, precise colored borders, and thin corners (`2dp` or `4dp`) matching the Material OutlinedButton design in Android XML.
3. **Clean Header & Navigation:** Replicated your Android Dashboard header with simple uppercase `"HELP"` and `"LOGOUT"` text buttons, and styled the tabs (`PLAY` and `FRIENDS`) with an accent-blue underline indicator exactly like the TabLayout.
4. **Active Game List (ÔÖƒ Badge):** Aligned active list items in Tab A to show the black pawn symbol `"ÔÖƒ"` colored in blue inside a dark circular background, opponent names, and the `"Predichess Match"` subtext.
5. **Top Bar Bullet Indicator:** Added a small red-pink square bullet next to the opponent's name in the gameplay header, matching the `@color/btn_resign` indicator in your `activity_game.xml` layout.
6. **Zero-Dependency SPA Architecture:** Double-clicking `index.html` still runs the client locally, instantly connecting to your Firestore database records!

---

## ­ƒôé Web Application Architecture

All web assets are self-contained inside the [docs/](file:///C:/Users/Henry/Documents/Coding_Projects/delta_chess/docs) folder:

*   **[index.html](file:///C:/Users/Henry/Documents/Coding_Projects/delta_chess/docs/index.html):** Aligned DOM structure with tabs, outlined action boxes, red header indicators, and review timeline controls.
*   **[styles.css](file:///C:/Users/Henry/Documents/Coding_Projects/delta_chess/docs/styles.css):** Cyber-tactical colors (space blue `#0C1017`, card navy `#161E2B`, check checkmate pink `#FF4D6D`, en passant indicators) styled into flat material layouts, thin outline buttons, and animated trap springs.
*   **[chess.js](file:///C:/Users/Henry/Documents/Coding_Projects/delta_chess/docs/chess.js):** Custom chess engine modeling your Kotlin `ChessBoard` class (validations, castling, en passant target coords, and pieces vaporization).
*   **[app.js](file:///C:/Users/Henry/Documents/Coding_Projects/delta_chess/docs/app.js):** Connects to Google Auth and Firestore listeners, translates coordinate structures, processes tap/drag actions, and renders clean inline vector SVGs.

---

## ­ƒÆ╗ How to Test Locally

Since this app uses pure static HTML, CSS, and modern JS modules, you can test it immediately on your machine:

1.  Navigate to your local repository directory: `C:\Users\Henry\Documents\Coding_Projects\delta_chess\docs`
2.  Double-click the **`index.html`** file, or drag-and-drop it into any modern web browser (Chrome, Edge, Firefox, Safari).
3.  The browser will load the login screen instantly! 

---

## ­ƒÜÇ Free Hosting on GitHub Pages (Setup in 1 Minute)

Since your project's git origin is already configured as `https://github.com/eboshii/delta_chess`, you can activate GitHub Pages instantly for free. This will put your web app live at:
**`https://eboshii.github.io/delta_chess/`**

### Step-by-Step Instructions:

1.  **Commit and Push the `/docs` Folder:**
    Open your terminal/command prompt and run:
    ```bash
    git add docs/
    git commit -m "feat: align web styling and names with Predichess Android app"
    git push origin main
    ```

2.  **Activate GitHub Pages in Settings:**
    *   Go to **GitHub** and open your repository: `https://github.com/eboshii/delta_chess`
    *   Click on the **Settings** tab.
    *   In the left sidebar, click on **Pages**.

3.  **Configure Build & Deployment:**
    *   Under **Build and deployment**, set **Source** to `Deploy from a branch`.
    *   Under **Branch**:
        *   Select `main` (or your default branch name).
        *   In the folder dropdown, change `/ (root)` to **`/docs`**.
    *   Click the **Save** button.

4.  **Enjoy Your Website!**
    *   In about 30 seconds, your site will be live at `https://eboshii.github.io/delta_chess/`
