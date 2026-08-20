# Procurement ERP

Construction procurement ERP blueprint for multi-site procurement operations.

## MVP workflow
PR -> RFQ -> Quotation Comparison -> Approval -> PO -> Delivery -> GRN -> Invoice -> Payment

## Modules
- Dashboard
- Projects / Sites
- Material Master
- Vendor Master
- Purchase Requisitions
- RFQs
- Quotations & comparison
- Purchase Orders
- GRN / stock receipt
- Invoice & payment tracking
- Reports
- AI Procurement Assistant

## AI use cases
- Natural-language procurement queries
- Quotation extraction/comparison
- Rate anomaly detection
- Vendor recommendation
- Reorder alerts
- PO/RFQ drafting
- Spend and savings analysis

## Security
Never commit OPENAI_API_KEY, database passwords, JWT secrets, or vendor/customer credentials.
Use environment variables / GitHub Actions secrets.
