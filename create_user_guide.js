const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType, PageBreak } = require('docx');
const fs = require('fs');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: "Arial", size: 22 },
      },
    },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "2E75B6" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "2E75B6" },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 1 },
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "4472C4" },
        paragraph: { spacing: { before: 120, after: 80 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: "bullet",
            text: "•",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: 720, hanging: 360 },
              },
            },
          },
        ],
      },
      {
        reference: "numbers",
        levels: [
          {
            level: 0,
            format: "decimal",
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: 720, hanging: 360 },
              },
            },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        // Title
        new Paragraph({
          spacing: { before: 400 },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "MOBILEPOS",
              bold: true,
              size: 56,
              color: "2E75B6",
            }),
          ],
        }),
        new Paragraph({
          spacing: { after: 200 },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "Complete User Guide",
              size: 32,
              color: "4472C4",
            }),
          ],
        }),
        new Paragraph({
          spacing: { before: 600, after: 600 },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "For Admins, Managers & Cashiers",
              size: 24,
              italic: true,
            }),
          ],
        }),
        new Paragraph({
          spacing: { before: 800 },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "Version 1.0 | May 2026",
              size: 22,
              color: "666666",
            }),
          ],
        }),
        new Paragraph({
          spacing: { before: 1200 },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "Mobile Point of Sale System",
              size: 20,
            }),
          ],
        }),
        new Paragraph({
          children: [new PageBreak()],
        }),

        // TOC
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("Table of Contents")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Getting Started")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Admin User Guide")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Manager User Guide")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Cashier User Guide")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Suppliers Directory & Ledger")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Physical Stock Count & Reconciliation")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Inventory Movement Ledger")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Offline Mode & Synchronization")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Troubleshooting & FAQ")],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [new PageBreak()],
        }),

        // Getting Started
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("1. Getting Started")],
        }),
        new Paragraph({
          spacing: { before: 120 },
          children: [
            new TextRun({
              text: "Welcome to MobilePOS!",
              bold: true,
              size: 24,
            }),
          ],
        }),
        new Paragraph({
          spacing: { before: 120, after: 120 },
          children: [
            new TextRun("MobilePOS is a modern, mobile-first point of sale system designed for retail stores. This guide covers everything you need to know to use the app effectively."),
          ],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("System Requirements")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Android 8.0+ or iOS 12.0+")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Internet connection (for online syncing)")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Biometric authentication capability (fingerprint or face recognition)")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Camera (for barcode scanning)")],
          spacing: { after: 200 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Logging In")],
        }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new TextRun("Your system administrator will provide you with:")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Biometric token (fingerprint/face)")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Store ID")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Your assigned role (Admin, Manager, or Cashier)")],
          spacing: { after: 120 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("First Time Setup")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Open the MobilePOS app on your device")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun('Tap "Biometric Login"')],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Scan your biometric (fingerprint/face)")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("On first login, the system will register your biometric token")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Select your store from the dropdown")],
          spacing: { after: 200 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Your Role & Permissions")],
        }),
        createRoleTable(),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Admin Guide
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("2. Admin User Guide")],
        }),
        new Paragraph({
          spacing: { before: 120, after: 200 },
          children: [
            new TextRun("As an Admin, you have full access to all system features including user management, inventory control, analytics, and store configuration."),
          ],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Dashboard Overview")],
        }),
        new Paragraph({
          spacing: { before: 120, after: 120 },
          children: [new TextRun("The Dashboard displays key metrics at a glance:")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Total Revenue - Today's sales total")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Transaction Count - Number of sales completed")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Top Products - Best-selling items")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Sync Status - Online/Offline indicator")],
          spacing: { after: 200 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Managing Products & Inventory")],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("Add a Product")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun('Navigate to "Inventory" > "Products"')],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun('Tap the "+Add Product" button')],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Fill in the required fields:")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 1 },
          children: [new TextRun("Product Name")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 1 },
          children: [new TextRun("SKU (unique stock keeping unit)")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 1 },
          children: [new TextRun("Barcode (optional - scan to fill)")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 1 },
          children: [new TextRun("Category")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 1 },
          children: [new TextRun("Marked Price (original price)")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 1 },
          children: [new TextRun("Effective Price (sale price)")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 1 },
          children: [new TextRun("Cost Price")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 1 },
          children: [new TextRun("Tax Rate (%)")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 1 },
          children: [new TextRun("Unit (piece, kg, liter, etc.)")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun('Tap "Save Product"')],
          spacing: { after: 200 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("Bulk Import Products")],
        }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [
            new TextRun("Import multiple products at once using a CSV file:"),
          ],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun('Go to Settings > Inventory > "Bulk Import"')],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Download the CSV template")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Fill in your product data (Name, SKU, Price, Tax Rate, etc.)")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Select target branch")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Paste CSV content into the dialog")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun('Tap "Import"')],
          spacing: { after: 200 },
        }),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Manager Guide
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("3. Manager User Guide")],
        }),
        new Paragraph({
          spacing: { before: 120, after: 200 },
          children: [
            new TextRun("As a Manager, you have responsibility for daily operations, inventory oversight, and sales tracking. You can access Dashboard, Inventory, Customers, Analytics, and Settings."),
          ],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Daily Operations Checklist")],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("Start of Day")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Login to the app")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Check Dashboard for system status (online/offline)")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Review low-stock alerts in Inventory section")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Brief staff on any urgent items")],
          spacing: { after: 120 },
        }),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Cashier Guide
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("4. Cashier User Guide")],
        }),
        new Paragraph({
          spacing: { before: 120, after: 200 },
          children: [
            new TextRun("As a Cashier, your primary responsibility is processing customer transactions. You have access to Dashboard, Customers, and Settings."),
          ],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Processing a Sale")],
        }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new TextRun("Step-by-step checkout process:")],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("1. Open Checkout")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun('From Dashboard, tap the "Checkout" quick action')],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Or swipe up from bottom navigation")],
          spacing: { after: 120 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("2. Add Products")],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("Option A: Search by Name")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Tap the search bar")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Type product name")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Tap the product to add to cart")],
          spacing: { after: 120 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("Option B: Scan Barcode")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Tap the QR icon")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Allow camera access")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Scan product barcode")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Product automatically adds to cart")],
          spacing: { after: 120 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("3. Adjust Quantities")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Review items in cart")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Tap +/- buttons to adjust quantities")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Swipe to remove items")],
          spacing: { after: 120 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("4. Select Payment Method")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Cash - Instant payment")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Card - Debit/credit card")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Transfer - Mobile wallet/bank transfer")],
          spacing: { after: 120 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("5. Complete Transaction")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Review total amount")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun('Tap "Complete Transaction"')],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Receipt generates automatically")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Share receipt via email/SMS if customer requests")],
          spacing: { after: 200 },
        }),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Suppliers Directory & Ledger
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("5. Suppliers Directory & Ledger")],
        }),
        new Paragraph({
          spacing: { before: 120, after: 120 },
          children: [
            new TextRun("The Suppliers Directory is a centralized vendor management hub. It enables Admins and Managers to track inventory acquisition costs, outstanding liabilities, and individual invoice payment statuses."),
          ],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Suppliers Directory")],
        }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new TextRun("To access and manage your suppliers:")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Navigate to 'Suppliers' from the side navigation menu.")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Use the filter chips at the top to toggle between All, Preferred, and Blocked suppliers.")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Search for specific suppliers using the top search bar (by name or category).")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("To add a supplier, tap '+ Add Supplier', fill in the name, phone number, email address, physical address, notes, and select their category and tag, then save.")],
        }),
        new Paragraph({
          spacing: { before: 120, after: 120 },
          children: [
            new TextRun("Tapping on any supplier displays their profile bottom sheet containing quick statistics:"),
          ],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Invoiced: Total value of goods purchased from them.")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Paid: Total payments sent to the supplier.")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Owing: Outstanding debt currently owed to the supplier.")],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Supplier Ledger & Invoices")],
        }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new TextRun("To manage purchase invoices and log payments for a supplier:")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Tap the supplier in the directory and select 'View Ledger'.")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("The 'Invoices' tab lists all purchase records. Tap '+ Add Invoice' to log a new purchase. The invoice reference (e.g. INV-YYYYMMDD-XXXX) is auto-generated but can be edited.")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Enter the Invoice Date, Due Date, Quantity purchased, Unit Price, Total Amount, and any relevant description/notes, then tap save.")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("To record a payment against an invoice, switch to the 'Payments' tab and tap '+ Record Payment'. Enter the payment amount, date, notes, and choose the matching invoice, then save.")],
        }),
        new Paragraph({
          spacing: { before: 120, after: 120 },
          children: [
            new TextRun("The system automatically recalculates the cumulative payments against the invoice and shifts the status indicator dynamically:"),
          ],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Unpaid: No payments have been logged for this invoice.")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Partial: Payments have been made but they do not cover the full invoice amount.")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Paid: The invoice amount has been fully covered by payments.")],
        }),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Physical Stock Count & Reconciliation
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("6. Physical Stock Count & Reconciliation")],
        }),
        new Paragraph({
          spacing: { before: 120, after: 120 },
          children: [
            new TextRun("The Stock Count module provides a mechanism for managers to perform regular inventory audits, identifying shrinkage or stock discrepancies and reconciling the digital database with physical shelf items."),
          ],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Starting an Audit Session")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Open the side menu and navigate to 'Stock Counts'.")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("If you are logged in as an Admin, select the target branch from the dropdown menu. If you are a Manager, the session defaults to your assigned branch.")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Tap '+ New Count', enter a reference note (e.g. 'End of Month Audit'), and tap 'Create'. This initializes a draft session capturing all catalog products with their current system stock counts.")],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Entering Counts & Barcode Scanning")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Open the active count session. You will see a list of products with their system inventory quantities.")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Search for a product by typing its name/SKU, or tap the Barcode Scan icon to scan the item's barcode using your mobile device's camera.")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Tap the product row to enter the physical quantity counted. The system will instantly calculate the Variance (Variance = Physical Quantity - System Quantity). Positive variance denotes overages, while negative variance highlights shrinkage.")],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Reconciling and Adjusting Stock")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Double check any highlighted variances to ensure accurate entry.")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("When satisfied, tap 'Complete' in the header.")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Confirm the action. On completion, the system applies the counts, overriding old stock counts with physical values, closing the audit session, and generating inventory ledger entries.")],
        }),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Inventory Movement Ledger
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("7. Inventory Movement Ledger")],
        }),
        new Paragraph({
          spacing: { before: 120, after: 120 },
          children: [
            new TextRun("For auditing and compliance, the Inventory Movement Ledger records every transaction or action that alters a product's stock levels. This makes it simple to trace the origin of stock discrepancies."),
          ],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Viewing a Product's Ledger")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Navigate to the 'Inventory' section from the main menu.")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("Locate and tap on the product you wish to investigate.")],
        }),
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          children: [new TextRun("In the detail pop-up card, select 'Inventory Ledger' (or 'Product Movement'). The system will display the movement sheet.")],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Understanding Movement Records")],
        }),
        new Paragraph({
          spacing: { before: 120, after: 120 },
          children: [
            new TextRun("The movement log lists entries chronologically, capturing the following details:"),
          ],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Movement Type: SALE (checkout deduction), RETURN (customer return addition), PURCHASE (supplier invoice increment), ADJUSTMENT (manual override or stock count reconcile), or TRANSFER (inter-branch movement).")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Quantity Impact: Displays the relative change (e.g. +24, -3) and color-codes them (green for additions, red for deductions).")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Timestamp & Operator: Shows the date/time and the name of the cashier or manager who executed the action.")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Reference/Notes: Logs associated invoice numbers, transaction IDs, stock session notes, or manager descriptions.")],
        }),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Offline Mode
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("8. Offline Mode & Synchronization")],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("How Offline Mode Works")],
        }),
        new Paragraph({
          spacing: { before: 120, after: 120 },
          children: [
            new TextRun("MobilePOS is designed to work even without internet connection:"),
          ],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Green indicator = Online and syncing")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Red indicator = Offline, transactions stored locally")],
          spacing: { after: 200 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("What You Can Do Offline")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Process transactions")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Search for products")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("View cached customer data")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Add products to inventory")],
          spacing: { after: 120 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Auto-Synchronization")],
        }),
        new Paragraph({
          spacing: { before: 120, after: 120 },
          children: [
            new TextRun("When your device reconnects to the internet, MobilePOS automatically syncs:"),
          ],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("All offline transactions")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("Inventory adjustments")],
        }),
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun("New customers")],
          spacing: { after: 200 },
        }),

        new Paragraph({
          children: [new PageBreak()],
        }),

        // Troubleshooting
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("9. Troubleshooting & FAQ")],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("Common Issues")],
        }),
        createTroubleshootingTable(),

        new Paragraph({
          spacing: { before: 200, after: 200 },
          children: [new TextRun("")],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("FAQ")],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("Q: How do I reset my biometric login?")],
        }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [
            new TextRun('A: Go to Settings > Security > Biometric. You can disable and re-register your fingerprint or face.'),
          ],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("Q: What happens if the app crashes during checkout?")],
        }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [
            new TextRun("A: Your cart is automatically saved. When you reopen the app, you can resume checkout from where you left off."),
          ],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("Q: Can I change product prices after entering them?")],
        }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [
            new TextRun('A: Yes. Go to Inventory > Products, find the product, and edit the price fields. Changes take effect immediately.'),
          ],
        }),

        new Paragraph({
          spacing: { before: 300 },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "For additional support, contact your system administrator.",
              italic: true,
            }),
          ],
        }),

        new Paragraph({
          spacing: { before: 200 },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "Copyright 2026 MobilePOS. All rights reserved.",
              size: 20,
              color: "999999",
            }),
          ],
        }),
      ],
    },
  ],
});

function createRoleTable() {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2340, 2340, 2340, 2340],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: 2340, type: WidthType.DXA },
            shading: { fill: "2E75B6", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Role",
                    bold: true,
                    color: "FFFFFF",
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            borders,
            width: { size: 2340, type: WidthType.DXA },
            shading: { fill: "2E75B6", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Access",
                    bold: true,
                    color: "FFFFFF",
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            borders,
            width: { size: 2340, type: WidthType.DXA },
            shading: { fill: "2E75B6", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Key Duties",
                    bold: true,
                    color: "FFFFFF",
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            borders,
            width: { size: 2340, type: WidthType.DXA },
            shading: { fill: "2E75B6", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Restrictions",
                    bold: true,
                    color: "FFFFFF",
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: 2340, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Admin")] })],
          }),
          new TableCell({
            borders,
            width: { size: 2340, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("All")] })],
          }),
          new TableCell({
            borders,
            width: { size: 2340, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Full system access, user management, store config")] })],
          }),
          new TableCell({
            borders,
            width: { size: 2340, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("None")] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: 2340, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Manager")] })],
          }),
          new TableCell({
            borders,
            width: { size: 2340, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Dashboard, Inventory, Customers, Analytics, Settings")] })],
          }),
          new TableCell({
            borders,
            width: { size: 2340, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Inventory oversight, staff supervision, daily reporting")] })],
          }),
          new TableCell({
            borders,
            width: { size: 2340, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("No user management")] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: 2340, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Cashier")] })],
          }),
          new TableCell({
            borders,
            width: { size: 2340, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Dashboard, Customers, Settings")] })],
          }),
          new TableCell({
            borders,
            width: { size: 2340, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Process transactions, manage cart")] })],
          }),
          new TableCell({
            borders,
            width: { size: 2340, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("No inventory changes, no user management, no refunds")] })],
          }),
        ],
      }),
    ],
  });
}

function createTroubleshootingTable() {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2800, 3280, 3280],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: 2800, type: WidthType.DXA },
            shading: { fill: "2E75B6", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Problem",
                    bold: true,
                    color: "FFFFFF",
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            borders,
            width: { size: 3280, type: WidthType.DXA },
            shading: { fill: "2E75B6", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Cause",
                    bold: true,
                    color: "FFFFFF",
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            borders,
            width: { size: 3280, type: WidthType.DXA },
            shading: { fill: "2E75B6", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Solution",
                    bold: true,
                    color: "FFFFFF",
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: 2800, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Can't login")] })],
          }),
          new TableCell({
            borders,
            width: { size: 3280, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Biometric not registered or device offline")] })],
          }),
          new TableCell({
            borders,
            width: { size: 3280, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Check internet, try biometric again, or contact admin")] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: 2800, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Product not found")] })],
          }),
          new TableCell({
            borders,
            width: { size: 3280, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Product not added to inventory")] })],
          }),
          new TableCell({
            borders,
            width: { size: 3280, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Add product to inventory first, or check spelling")] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: 2800, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Transaction fails")] })],
          }),
          new TableCell({
            borders,
            width: { size: 3280, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Internet connection lost")] })],
          }),
          new TableCell({
            borders,
            width: { size: 3280, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Switch to offline mode, or wait for connection and retry")] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: 2800, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Barcode scan fails")] })],
          }),
          new TableCell({
            borders,
            width: { size: 3280, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Camera permissions denied or barcode not registered")] })],
          }),
          new TableCell({
            borders,
            width: { size: 3280, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Allow camera access, or verify barcode in product settings")] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: 2800, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("App is slow")] })],
          }),
          new TableCell({
            borders,
            width: { size: 3280, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Too much cached data or low device storage")] })],
          }),
          new TableCell({
            borders,
            width: { size: 3280, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun("Clear cache in Settings, restart app, or free device storage")] })],
          }),
        ],
      }),
    ],
  });
}

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync("C:\\Projects\\MobilePOS\\JayPOS_User_Guide.docx", buffer);
  console.log("✅ User guide created successfully: JayPOS_User_Guide.docx");
});
