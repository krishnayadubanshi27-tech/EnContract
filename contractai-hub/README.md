# Contract Companion

Project Name: EnContract App Type: Web Application for Contract and Compliance Management Core Rules: Do NOT add, hardcode, or generate any mock or demo PDF files anywhere in the app. Start with empty states.

Please build a web app with the following screens and features:

1. Welcome & Animation (Like Hotstar)

When the app loads, show a quick, smooth fade-in "pop" animation or splash screen with the "EnContract" logo before showing the main page.

2. Authentication System

New Users: Show a sign-up/sign-in page. Include buttons for "Sign in with Google" and "Sign in with Phone Number". If the phone number is chosen, include an OTP (One Time Password) input flow.

Returning Users: Automatically log them into their dashboard.

3. Landing Page (Home)

Header (Top Navigation):

Top Left: The text "EnContract" in a bold font. Right below it, a smaller sub-headline: "your own contract and compliance manager".

Top Middle: Two clickable links: "Features" (which scrolls down to a features list at the bottom of the page) and "Why use us?" (which scrolls to a section explaining the benefits).

Top Right: A button saying "Enter Workspace" for returning users to access their past analyzed PDFs.

Main Hero Section (Middle of the page):

Display a large, clean, standard "Select a PDF" upload box (drag-and-drop style).

4. Workspace Selection Flow

Once a user uploads a PDF from the home page, open a popup modal or a new screen.

This screen should ask the user to either "Create a New Workspace" or "Select an Existing Workspace" to save the uploaded PDF.

5. Dashboard & PDF Analysis Interface

After the PDF is placed in a workspace, show the main dashboard.

Visual Data: Show a summary of the legal document. Use charts (like pie charts and bar graphs) to show the data.

Color Rules for Charts: Use Green for positive impacts/clauses and Red for negative impacts/risks.

6. AI Assistant

Include a chat-like AI assistant on the dashboard.

This AI should automatically read the uploaded PDF and give recommendations, next steps, and risk warnings.

Technical Note: Set up the AI logic so it can easily be swapped to a local AI model (like WebLLM) in the future.

7. Quick Action Buttons (One-Click)

Provide a row of quick action buttons for the user to manage the contract.

Buttons should include: "Send NDA", "Sign Pending", and "Renewal Pending".

8. Editable Workspace

Allow the user to manage their files easily.

Include options to add new contracts, remove old contracts, and organize them within the workspace at any time.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/44c14bd4-19e4-4e02-8009-0146ef0bed95).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
