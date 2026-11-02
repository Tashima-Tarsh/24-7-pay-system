#!/usr/bin/env python3
"""Generate Sanbook Pay step-by-step manual PDF."""
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.units import inch, mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    HRFlowable, KeepTogether, ListFlowable, ListItem
)

PAGE_W, PAGE_H = A4
MARGIN = 0.75 * inch

styles = getSampleStyleSheet()

# Custom styles
title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=24, leading=28, textColor=colors.HexColor('#0b0f19'), alignment=TA_CENTER, spaceAfter=6)
subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=12, leading=16, textColor=colors.HexColor('#64748b'), alignment=TA_CENTER, spaceAfter=20)
h1_style = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=16, leading=20, textColor=colors.HexColor('#0f172a'), spaceBefore=18, spaceAfter=8)
h2_style = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=13, leading=17, textColor=colors.HexColor('#1e293b'), spaceBefore=14, spaceAfter=6)
body_style = ParagraphStyle('Body', parent=styles['Normal'], fontSize=9.5, leading=14, textColor=colors.HexColor('#1e293b'), alignment=TA_JUSTIFY, spaceAfter=6)
code_style = ParagraphStyle('Code', parent=styles['Code'], fontSize=8.5, leading=11, textColor=colors.HexColor('#0f172a'), backColor=colors.HexColor('#f1f5f9'), borderColor=colors.HexColor('#cbd5e1'), borderWidth=0.5, borderPadding=8, spaceBefore=4, spaceAfter=8)
code_block_style = ParagraphStyle('CodeBlock', parent=code_style, leftIndent=10, rightIndent=10, fontName='Courier', fontSize=8.2, leading=11)
small_style = ParagraphStyle('Small', parent=styles['Normal'], fontSize=8.5, leading=12, textColor=colors.HexColor('#64748b'), spaceAfter=4)
tag_style = ParagraphStyle('Tag', parent=styles['Normal'], fontSize=8, leading=11, textColor=colors.HexColor('#ffffff'), backColor=colors.HexColor('#6366f1'), borderPadding=2, spaceAfter=2)

def P(text, style=body_style):
    return Paragraph(text, style)

def C(text):
    return Paragraph(text, code_block_style)

def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor('#e2e8f0'))
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, PAGE_H - 0.55 * inch, PAGE_W - MARGIN, PAGE_H - 0.55 * inch)
    canvas.setFont('Helvetica', 7.5)
    canvas.setFillColor(colors.HexColor('#64748b'))
    canvas.drawString(MARGIN, PAGE_H - 0.45 * inch, 'Sanbook Pay - UPI Payment Manual')
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 0.45 * inch, f'Page {doc.page}')
    canvas.line(MARGIN, 0.55 * inch, PAGE_W - MARGIN, 0.55 * inch)
    canvas.drawString(MARGIN, 0.4 * inch, 'Sanbook Pay - White-Label UPI Payment Gateway')
    canvas.drawRightString(PAGE_W - MARGIN, 0.4 * inch, 'Version 1.0 | November 2026')
    canvas.restoreState()

def callout(title, text, bg_color='#eff6ff', border_color='#3b82f6', text_color='#0f172a'):
    t = Paragraph(f'<b>{title}</b>', ParagraphStyle('CalloutTitle', parent=body_style, fontSize=9.5, leading=13, textColor=text_color, spaceAfter=3))
    b = Paragraph(text, ParagraphStyle('CalloutBody', parent=body_style, fontSize=9, leading=13, textColor=text_color, leftIndent=4))
    t_table = Table([[t], [b]], colWidths=[PAGE_W - 2 * MARGIN])
    t_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(bg_color)),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor(border_color)),
        ('LINEBEFORE', (0, 0), (0, -1), 3, colors.HexColor(border_color)),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    return t_table

def step_table(rows, col_widths=None):
    t = Table(rows, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f172a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#ffffff')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8.5),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8.5),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#1e293b')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#ffffff'), colors.HexColor('#f8fafc')]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    return t

story = []

# ============ COVER ============
story.append(Spacer(1, 0.6 * inch))
story.append(P('Sanbook Pay', title_style))
story.append(P('White-Label UPI Payment Gateway - Step-by-Step Manual', subtitle_style))
story.append(HRFlowable(width='60%', thickness=1.2, color=colors.HexColor('#6366f1'), spaceAfter=16, hAlign='CENTER'))

cover_info = [
    ['Document', 'Step-by-Step Manual - Merchant Creation to Intent Return'],
    ['Version', '1.0'],
    ['Date', 'November 2026'],
    ['Platform', 'Sanbook Pay (youpi-pg)'],
    ['Payment Mode', 'UPI Collection (No KYC, No Bank, No Fund Holding)'],
    ['Flow Covered', 'Create Merchant &rarr; Setup UPI VPA &rarr; Create Payment Link &rarr; Customer Pays &rarr; Intent Return &rarr; Ledger'],
]
t = Table(cover_info, colWidths=[1.6 * inch, 4.6 * inch])
t.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
    ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
    ('FONTSIZE', (0, 0), (-1, -1), 9),
    ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#64748b')),
    ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#1e293b')),
    ('LINEBELOW', (0, 0), (-1, -2), 0.5, colors.HexColor('#e2e8f0')),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ('LEFTPADDING', (0, 0), (-1, -1), 0),
]))
story.append(t)
story.append(Spacer(1, 0.4 * inch))
story.append(P('This manual walks through the complete UPI payment lifecycle from merchant onboarding to payment intent return and ledger verification. Every confirmed payment posts atomically to a double-entry ledger.', body_style))
story.append(PageBreak())

# ============ OVERVIEW ============
story.append(P('Table of Contents', h1_style))
toc_items = [
    'Phase 1 - Platform Owner Onboards Merchant',
    'Phase 2 - Merchant Sets Up UPI Payment Receiving',
    'Phase 3 - Merchant Creates a Payment Order (UPI QR)',
    'Phase 4 - Customer Pays & Real-Time Callback',
    'Phase 5 - Merchant Checks Payment Status & Intent Return',
    'Phase 6 - Ledger Verification (Every Payment Recorded)',
    'Android APK Integration (Mobile UPI)',
    'API Reference (cURL Examples)',
    'Troubleshooting',
]
toc_flow = ListFlowable(
    [ListItem(P(f'{i+1}. {item}', body_style), leftIndent=14, value='circle') for i, item in enumerate(toc_items)],
    bulletType='bullet', start='circle', leftIndent=14
)
story.append(toc_flow)
story.append(Spacer(1, 16))
story.append(callout('Architecture Overview', 'Sanbook Pay is a white-label UPI payment collection engine. The Platform Owner operates the central system and creates independent merchant accounts. Merchants receive UPI payments directly into their own VPA - the platform never holds funds.', border_color='#10b981'))
story.append(PageBreak())

# ============ PHASE 1 ============
story.append(P('Phase 1 - Platform Owner Onboards Merchant', h1_style))
story.append(P('The Platform Owner (Root Super Admin) creates the merchant account, sends a one-time invitation, and activates the merchant after approval. No KYC is required for UPI collection.', body_style))

story.append(P('Step 1.1 - Create Merchant Account', h2_style))
story.append(C('POST /api/platform/v1/merchants'))
story.append(C('Headers: Authorization: Bearer &lt;platform-admin-token&gt;, X-CSRF-Token: &lt;csrf&gt;'))
story.append(C('{'))
story.append(C('  "email": "owner@gamecompany.com",'))
story.append(C('  "password": "OwnerPass12345!",'))
story.append(C('  "businessName": "My Game Studio",'))
story.append(C('  "contactName": "John Owner",'))
story.append(C('  "mobile": "+919876543210",'))
story.append(C('  "category": "gaming",'))
story.append(C('  "address": "123 Game Street, Mumbai",'))
story.append(C('  "registrationNumber": "GST123456789",'))
story.append(C('  "taxId": "PANABCDE1234F"'))
story.append(C('}'))
story.append(Spacer(1, 4))
story.append(P('Response includes <b>merchantId</b> (e.g. <i>m_abc123</i>) and <i>status: EMAIL_PENDING</i>.', body_style))

story.append(P('Step 1.2 - Send Owner Invitation', h2_style))
story.append(C('POST /api/platform/v1/merchants/m_abc123/invite-owner'))
story.append(C('Headers: Authorization: Bearer &lt;platform-admin-token&gt;'))
story.append(Spacer(1, 4))
story.append(P('The owner receives an email + SMS with a one-time setup link (expires in 24 hours, single-use).', body_style))

story.append(P('Step 1.3 - Merchant Accepts Invitation & Sets Password', h2_style))
story.append(C('POST /api/platform/v1/owner-invitations/accept'))
story.append(C('{'))
story.append(C('  "token": "&lt;one-time-token&gt;",'))
story.append(C('  "password": "OwnerPass12345!"'))
story.append(C('}'))
story.append(Spacer(1, 4))

story.append(P('Step 1.4 - Merchant Login (MFA Required)', h2_style))
story.append(C('POST /api/platform/v1/login'))
story.append(C('{ "email": "owner@gamecompany.com", "password": "OwnerPass12345!", "merchantId": "m_abc123" }'))
story.append(C('Then: POST /api/platform/v1/login/mfa { "challenge": "&lt;token&gt;", "code": "123456" }'))
story.append(Spacer(1, 4))
story.append(P('Session cookie <i>dp_platform_session</i> is set (HttpOnly, SameSite=Strict). CSRF token returned for state-changing requests.', body_style))

story.append(P('Step 1.5 - Complete Business Onboarding', h2_style))
story.append(C('POST /api/platform/v1/onboarding'))
story.append(C('Headers: Cookie: dp_platform_session=&lt;session&gt;, X-CSRF-Token: &lt;csrf&gt;'))
story.append(C('{'))
story.append(C('  "businessName": "My Game Studio",'))
story.append(C('  "contactName": "John Owner",'))
story.append(C('  "mobile": "+919876543210",'))
story.append(C('  "category": "gaming",'))
story.append(C('  "address": "123 Game Street, Mumbai",'))
story.append(C('  "registrationNumber": "GST123456789",'))
story.append(C('  "taxId": "PANABCDE1234F",'))
story.append(C('  "submit": true'))
story.append(C('}'))
story.append(Spacer(1, 4))
story.append(P('Status: <i>UNDER_REVIEW</i>. Platform owner must approve in Step 1.6.', body_style))

story.append(P('Step 1.6 - Platform Owner Activates Merchant', h2_style))
story.append(C('POST /api/platform/v1/merchants/m_abc123/state'))
story.append(C('{ "status": "ACTIVE", "reason": "Merchant verified and approved for gaming payments" }'))
story.append(Spacer(1, 4))
story.append(P('Merchant is now <b>ACTIVE</b> and can create payment links.', body_style))
story.append(PageBreak())

# ============ PHASE 2 ============
story.append(P('Phase 2 - Merchant Sets Up UPI Payment Receiving', h1_style))
story.append(P('The merchant registers their UPI VPA (Virtual Payment Address) and callback URL. Money goes directly to the merchant VPA - platform holds nothing.', body_style))

story.append(P('Step 2.1 - Register UPI VPA', h2_style))
story.append(C('POST /api/v1/upi/merchant/setup'))
story.append(C('Headers: Cookie: dp_platform_session=&lt;session&gt;'))
story.append(C('{'))
story.append(C('  "merchantId": "m_abc123",'))
story.append(C('  "upiVpa": "mygame@upi",'))
story.append(C('  "callbackUrl": "https://gamebackend.example.com/upi-callback",'))
story.append(C('  "businessName": "My Game Studio",'))
story.append(C('  "contactEmail": "owner@gamecompany.com",'))
story.append(C('  "contactPhone": "+919876543210"'))
story.append(C('}'))
story.append(Spacer(1, 4))

story.append(P('Response - everything the merchant receives:', body_style))
story.append(C('{'))
story.append(C('  "merchantId": "m_abc123",'))
story.append(C('  "businessName": "My Game Studio",'))
story.append(C('  "upiVpa": "mygame@upi",'))
story.append(C('  "callbackUrl": "https://gamebackend.example.com/upi-callback",'))
story.append(C('  "webhookSecret": "&lt;32-char-base64&gt;",'))
story.append(C('  "accessToken": "&lt;32-char-base64&gt;",'))
story.append(C('  "accessLink": "/merchant/m_abc123",'))
story.append(C('  "apiBaseUrl": "https://your-domain.com"'))
story.append(C('}'))
story.append(Spacer(1, 4))

story.append(callout('Merchant Credentials', 'Share your UPI VPA (mygame@upi) with customers. They pay directly to this VPA. Save the Webhook Secret - you will verify HMAC-SHA256 signatures on incoming callbacks.', border_color='#10b981'))
story.append(Spacer(1, 8))

story.append(P('Step 2.2 - Multi-Operator Staff Setup (Optional)', h2_style))
story.append(P('The merchant can invite staff with roles: OWNER, ADMIN, DEVELOPER, FINANCE, SUPPORT, VIEWER.', body_style))
story.append(C('POST /api/v1/multi-operator/users'))
story.append(C('{ "merchantId": "m_abc123", "email": "finance@gamecompany.com", "roleId": "finance-role", "invitedBy": "owner" }'))
story.append(PageBreak())

# ============ PHASE 3 ============
story.append(P('Phase 3 - Merchant Creates a Payment Order (UPI QR)', h1_style))
story.append(P('The merchant creates an amount-only payment link. The system generates a UPI QR URI and checkout page. No manual Order ID, customer name, mobile, or UTR required.', body_style))

story.append(P('Step 3.1 - Create Payment Order', h2_style))
story.append(C('POST /api/v1/upi/orders'))
story.append(C('Headers: X-Merchant-Id: m_abc123'))
story.append(C('{'))
story.append(C('  "orderId": "GAME-ORDER-001",'))
story.append(C('  "amount": "100.00",'))
story.append(C('  "currency": "INR",'))
story.append(C('  "callbackUrl": "https://gamebackend.example.com/upi-callback"'))
story.append(C('}'))
story.append(Spacer(1, 4))
story.append(P('Response:', body_style))
story.append(C('{'))
story.append(C('  "id": "&lt;order-uuid&gt;",'))
story.append(C('  "orderId": "GAME-ORDER-001",'))
story.append(C('  "amountPaise": 10000,'))
story.append(C('  "currency": "INR",'))
story.append(C('  "status": "PENDING",'))
story.append(C('  "upiVpa": "mygame@upi",'))
story.append(C('  "qrUri": "upi://pay?pa=mygame%40upi&pn=Merchant&mode=04&tr=GAME-ORDER-001&tn=Payment+GAME-ORDER-001&am=100.00&cu=INR",'))
story.append(C('  "callbackUrl": "https://gamebackend.example.com/upi-callback"'))
story.append(C('}'))
story.append(Spacer(1, 4))
story.append(P('The merchant displays the QR URI (or QR code image) to the customer. Customer pays ₹100.00 to mygame@upi from any UPI app (Google Pay, PhonePe, Paytm, BHIM, Amazon Pay, CRED).', body_style))

story.append(P('Step 3.2 - Customer Checkout Page', h2_style))
story.append(P('The merchant shares the checkout link: <i>https://your-domain.com/checkout/&lt;payment-id&gt;</i>. The page shows:', body_style))
story.append(P('• Payable amount (₹100.00)', body_style))
story.append(P('• Live UPI QR code (auto-generated SVG)', body_style))
story.append(P('• Payee VPA (mygame@upi) with copy-to-clipboard', body_style))
story.append(P('• App launcher grid: Google Pay, PhonePe, Paytm, Generic UPI', body_style))
story.append(P('• Sticky mobile "I\'ve Paid" button', body_style))
story.append(P('• Auto-polling payment status every 3 seconds', body_style))
story.append(PageBreak())

# ============ PHASE 4 ============
story.append(P('Phase 4 - Customer Pays & Real-Time Callback', h1_style))
story.append(P('Customer opens any UPI app, scans the QR, and pays ₹100.00 to mygame@upi. Money goes directly to the merchant bank account.', body_style))

story.append(P('Step 4.1 - Customer Scans and Pays', h2_style))
story.append(P('Customer opens Google Pay / PhonePe / Paytm / BHIM, scans the QR, confirms payment of ₹100.00. Funds are transferred to the merchant VPA immediately.', body_style))

story.append(P('Step 4.2 - Observer Detects Credit & Posts UTR', h2_style))
story.append(P('The Android observer app (or SMS/Gmail monitor) detects the UPI credit notification and posts:', body_style))
story.append(C('POST /api/v1/upi/notify'))
story.append(C('Headers: X-Merchant-Id: m_abc123, X-Merchant-Secret: &lt;webhook-secret&gt;'))
story.append(C('{'))
story.append(C('  "orderId": "GAME-ORDER-001",'))
story.append(C('  "amountPaise": 10000,'))
story.append(C('  "utr": "123456789012",'))
story.append(C('  "senderVpa": "customer@upi",'))
story.append(C('  "source": "ANDROID_OBSERVER",'))
story.append(C('  "rawText": "₹100.00 credited to mygame@upi from customer@upi. UTR: 123456789012"'))
story.append(C('}'))
story.append(Spacer(1, 4))
story.append(P('Response:', body_style))
story.append(C('{'))
story.append(C('  "matched": true,'))
story.append(C('  "orderId": "GAME-ORDER-001",'))
story.append(C('  "status": "SUCCESS",'))
story.append(C('  "utr": "123456789012",'))
story.append(C('  "callback": { "sent": true, "status": 200 }'))
story.append(C('}'))
story.append(Spacer(1, 4))

story.append(P('Step 4.3 - Game Backend Receives Real-Time Callback', h2_style))
story.append(C('POST https://gamebackend.example.com/upi-callback'))
story.append(C('Headers:'))
story.append(C('  Content-Type: application/json'))
story.append(C('  X-Gateway-Event: PAYMENT_SUCCESS'))
story.append(C('  X-Gateway-Signature: sha256=&lt;hmac-of-payload-using-webhook-secret&gt;'))
story.append(C('  X-Gateway-Delivery-Id: &lt;order-uuid&gt;'))
story.append(C('  X-Gateway-Timestamp: &lt;timestamp&gt;'))
story.append(C('{'))
story.append(C('  "event": "PAYMENT_SUCCESS",'))
story.append(C('  "orderId": "GAME-ORDER-001",'))
story.append(C('  "paymentId": "&lt;order-uuid&gt;",'))
story.append(C('  "amount": "100.00",'))
story.append(C('  "amountPaise": 10000,'))
story.append(C('  "currency": "INR",'))
story.append(C('  "status": "SUCCESS",'))
story.append(C('  "utr": "123456789012",'))
story.append(C('  "senderVpa": "customer@upi",'))
story.append(C('  "payeeVpa": "mygame@upi",'))
story.append(C('  "completedAt": "2026-11-01T08:46:00.000Z"'))
story.append(C('}'))
story.append(Spacer(1, 4))
story.append(P('Game backend verifies: 1) HMAC-SHA256 signature = authentic, 2) orderId matches expected order, 3) amountPaise matches expected amount, 4) status is SUCCESS, 5) UTR is the 12-digit reference. Then credits the player wallet.', body_style))
story.append(PageBreak())

# ============ PHASE 5 ============
story.append(P('Phase 5 - Merchant Checks Payment Status & Intent Return', h1_style))
story.append(P('The merchant queries order status to confirm payment. The customer sees intent-return status on the checkout page.', body_style))

story.append(P('Step 5.1 - Merchant Queries Order Status', h2_style))
story.append(C('GET /api/v1/upi/orders/GAME-ORDER-001'))
story.append(C('Headers: X-Merchant-Id: m_abc123'))
story.append(Spacer(1, 4))
story.append(C('{'))
story.append(C('  "id": "&lt;order-uuid&gt;",'))
story.append(C('  "orderId": "GAME-ORDER-001",'))
story.append(C('  "amountPaise": 10000,'))
story.append(C('  "currency": "INR",'))
story.append(C('  "status": "SUCCESS",'))
story.append(C('  "upiVpa": "mygame@upi",'))
story.append(C('  "utr": "123456789012",'))
story.append(C('  "senderVpa": "customer@upi",'))
story.append(C('  "createdAt": "...",'))
story.append(C('  "completedAt": "..."'))
story.append(C('}'))
story.append(Spacer(1, 4))

story.append(P('Step 5.2 - Customer Checkout Intent Return', h2_style))
story.append(P('The customer checkout page auto-polls every 3 seconds. Status transitions:', body_style))
story.append(P('• <b>PENDING</b> → Waiting for customer to pay', body_style))
story.append(P('• <b>INTENT_OPENED</b> → UPI app opened (Android deep-link)', body_style))
story.append(P('• <b>CLIENT_REPORTED_SUCCESS</b> → Customer clicked "I\'ve Paid"', body_style))
story.append(P('• <b>SUCCESS</b> → Payment confirmed by bank observers / UTR', body_style))
story.append(P('• <b>FAILED / EXPIRED / CANCELLED</b> → Payment did not complete', body_style))
story.append(Spacer(1, 4))
story.append(P('On SUCCESS, the customer sees "Payment Successful!" and can return to the merchant store via the return URL.', body_style))

story.append(P('Step 5.3 - Payment-Done Verification Request', h2_style))
story.append(C('POST /api/v1/checkout/&lt;payment-id&gt;/payment-done'))
story.append(C('Headers: Content-Type: application/json'))
story.append(C('Body: {}'))
story.append(Spacer(1, 4))
story.append(P('Customer clicks "I\'ve Paid" to request verified confirmation. Status updates automatically as bank observers confirm.', body_style))
story.append(PageBreak())

# ============ PHASE 6 ============
story.append(P('Phase 6 - Ledger Verification (Every Payment Recorded)', h1_style))
story.append(P('Every confirmed UPI payment posts atomically to a double-entry financial ledger. Integer-paise accounting, no floating-point rounding.', body_style))

story.append(P('Step 6.1 - Ledger Entry on Confirmation', h2_style))
story.append(C('Debit: PROVIDER_CLEARING (Asset)  &rarr;  10000 paise'))
story.append(C('Credit: MERCHANT_RECEIVABLES (Asset)  &rarr;  10000 paise'))
story.append(C('Reference Type: COLLECTION | Reference ID: &lt;order-uuid&gt;'))
story.append(C('Narration: Provider confirmed collection. Bank reference: 123456789012'))
story.append(C('Status: POSTED (atomic - both entries commit or none)'))
story.append(Spacer(1, 4))

story.append(P('Step 6.2 - Query Merchant Journal', h2_style))
story.append(C('GET /api/v1/ledger/journal?merchantId=m_abc123&limit=50'))
story.append(Spacer(1, 4))
story.append(P('Returns all posted transactions with debit/credit entries, account codes, and amounts.', body_style))

story.append(P('Step 6.3 - Trial Balance', h2_style))
story.append(C('GET /api/v1/ledger/trial-balance?merchantId=m_abc123'))
story.append(Spacer(1, 4))
story.append(P('Returns all ledger account balances: MERCHANT_RECEIVABLES, PROVIDER_CLEARING, BANK_CASH, FEES, REFUND_LIABILITIES, etc.', body_style))
story.append(Spacer(1, 4))
story.append(callout('Ledger Properties', '• Atomic posting - both debit and credit commit together • Idempotent - same reference cannot post twice • Immutable - historical entries never silently rewritten • Integer paise - no floating-point errors', border_color='#10b981'))
story.append(PageBreak())

# ============ ANDROID APK ============
story.append(P('Android APK Integration (Mobile UPI)', h1_style))
story.append(P('The Android Bridge APK enables mobile-native UPI intent launching and notification observation.', body_style))
story.append(P('APK Path: <i>apps/android-bridge/app/build/outputs/apk/debug/app-debug.apk</i> (7.5 MB)', body_style))
story.append(P('Build: <i>cd apps/android-bridge && ./gradlew assembleDebug</i> (Android SDK 34, Java 17)', body_style))
story.append(P('Install: <i>adb install app-debug.apk</i>', body_style))
story.append(Spacer(1, 8))

story.append(P('Android UPI App Launcher Tiles:', body_style))
story.append(step_table([
    ['App', 'Package Name', 'Deep Link Scheme'],
    ['Google Pay', 'com.google.android.apps.nbu.paisa.user', 'upi://pay?...#Intent;scheme=upi;package=...;end'],
    ['PhonePe', 'com.phonepe.app', 'upi://pay?...#Intent;scheme=upi;package=...;end'],
    ['Paytm', 'net.one97.paytm', 'upi://pay?...#Intent;scheme=upi;package=...;end'],
    ['Generic UPI', '(any)', 'upi://pay?pa=...&am=...&tr=...&cu=INR'],
], col_widths=[1.3 * inch, 2.2 * inch, 2.7 * inch]))
story.append(Spacer(1, 8))
story.append(callout('Android Flow', 'Customer taps a UPI app tile → app opens with pre-filled payment → customer pays → returns to checkout page → status updates automatically.', border_color='#6366f1'))
story.append(PageBreak())

# ============ API REFERENCE ============
story.append(P('API Reference - cURL Examples', h1_style))

story.append(P('1. Register Merchant UPI VPA', h2_style))
story.append(C('curl -X POST http://localhost:6100/api/v1/upi/merchant/setup \\'))
story.append(C('  -H "Content-Type: application/json" \\'))
story.append(C('  -d '"'"'{"merchantId":"m_demo","upiVpa":"mygame@upi","callbackUrl":"https://game.example.com/callback","businessName":"Demo Game"}'"'"''))
story.append(Spacer(1, 4))

story.append(P('2. Create Payment Order', h2_style))
story.append(C('curl -X POST http://localhost:6100/api/v1/upi/orders \\'))
story.append(C('  -H "Content-Type: application/json" \\'))
story.append(C('  -H "X-Merchant-Id: m_demo" \\'))
story.append(C('  -d '"'"'{"orderId":"GAME-001","amount":"100.00"}'"'"''))
story.append(Spacer(1, 4))

story.append(P('3. Simulate Payment Received (Observer Posts UTR)', h2_style))
story.append(C('curl -X POST http://localhost:6100/api/v1/upi/notify \\'))
story.append(C('  -H "Content-Type: application/json" \\'))
story.append(C('  -H "X-Merchant-Id: m_demo" \\'))
story.append(C('  -H "X-Merchant-Secret: &lt;webhook-secret&gt;" \\'))
story.append(C('  -d '"'"'{"orderId":"GAME-001","amountPaise":10000,"utr":"123456789012","senderVpa":"customer@upi","source":"ANDROID_OBSERVER"}'"'"''))
story.append(Spacer(1, 4))

story.append(P('4. Check Order Status', h2_style))
story.append(C('curl http://localhost:6100/api/v1/upi/orders/GAME-001 \\'))
story.append(C('  -H "X-Merchant-Id: m_demo"'))
story.append(Spacer(1, 4))

story.append(P('5. Request Payment-Done Verification', h2_style))
story.append(C('curl -X POST http://localhost:6100/api/v1/checkout/&lt;payment-id&gt;/payment-done \\'))
story.append(C('  -H "Content-Type: application/json" \\'))
story.append(C('  -d '"'"'{}'"'"''))
story.append(PageBreak())

# ============ TROUBLESHOOTING ============
story.append(P('Troubleshooting', h1_style))

story.append(step_table([
    ['Issue', 'Cause', 'Fix'],
    ['Payment not detected', 'Observer not running or wrong VPA', 'Start Android observer/SMS/Gmail monitor; verify payeeVpa matches'],
    ['Callback not received', 'HMAC signature mismatch or endpoint down', 'Verify webhookSecret; ensure callbackUrl is public and returns 200'],
    ['Ledger entry missing', 'Payment not confirmed', 'Wait for provider confirmation; check order status is SUCCESS'],
    ['QR not loading', 'Session expired or inactive', 'Create new payment order; refresh checkout page'],
    ['MFA required', 'Sensitive operation without authentication', 'Complete login + MFA flow first'],
    ['Circuit breaker open', 'Provider connection failures', 'Wait for recovery timeout or manually reset via circuit-breaker control plane'],
], col_widths=[1.5 * inch, 2.3 * inch, 2.4 * inch]))

story.append(Spacer(1, 12))
story.append(HRFlowable(width='100%', thickness=0.8, color=colors.HexColor('#e2e8f0')))
story.append(P('Sanbook Pay - White-Label UPI Payment Gateway | Step-by-Step Manual | Version 1.0 | November 2026', small_style))
story.append(P('No KYC. No aggregator. No fund holding. Money goes straight to merchant UPI VPA.', small_style))

# Build PDF
doc = SimpleDocTemplate('Sanbook_Pay_UPI_Payment_Manual.pdf', pagesize=A4,
                        leftMargin=MARGIN, rightMargin=MARGIN,
                        topMargin=0.7 * inch, bottomMargin=0.7 * inch,
                        title='Sanbook Pay UPI Payment Manual',
                        author='Sanbook Pay')
doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
print('PDF generated: Sanbook_Pay_UPI_Payment_Manual.pdf')
