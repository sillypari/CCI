import csv
import io
import logging

logger = logging.getLogger(__name__)

try:
    import openpyxl
except ImportError:
    openpyxl = None

try:
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    has_reportlab = True
except ImportError:
    has_reportlab = False

class ExportService:
    def export_csv(self, data: list[dict], filename: str = "export.csv") -> bytes:
        if not data:
            return b""
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)
        return output.getvalue().encode('utf-8')

    def export_xlsx(self, sheets: dict[str, list[dict]], filename: str = "export.xlsx") -> bytes:
        if not openpyxl:
            logger.warning("openpyxl not installed. Falling back to CSV.")
            if sheets:
                first_sheet = list(sheets.values())[0]
                return self.export_csv(first_sheet)
            return b""
            
        wb = openpyxl.Workbook()
        wb.remove(wb.active)
        
        for sheet_name, data in sheets.items():
            ws = wb.create_sheet(title=sheet_name[:31])
            if data:
                headers = list(data[0].keys())
                ws.append(headers)
                for row in data:
                    ws.append([str(row.get(h, "")) for h in headers])
                    
        output = io.BytesIO()
        wb.save(output)
        return output.getvalue()
        
    def export_poi_pdf(self, poi_data: dict, filename: str = "poi_report.pdf") -> bytes:
        if not has_reportlab:
            logger.warning("reportlab not installed. Falling back to CSV.")
            # Basic fallback
            return self.export_csv(poi_data.get('sessions', []))
            
        output = io.BytesIO()
        doc = SimpleDocTemplate(output, pagesize=letter)
        elements = []
        styles = getSampleStyleSheet()
        
        # Title
        elements.append(Paragraph(f"Pramaan IPDR Engine - PoI Report", styles['Title']))
        elements.append(Spacer(1, 12))
        
        # Summary
        summary_text = (
            f"MSISDN: {poi_data.get('msisdn', 'Unknown')}<br/>"
            f"Total Sessions: {poi_data.get('total_sessions', 0)}<br/>"
            f"Actionable P2P: {poi_data.get('p2p', 0)}<br/>"
            f"Relay: {poi_data.get('relay', 0)}<br/>"
        )
        elements.append(Paragraph(summary_text, styles['Normal']))
        elements.append(Spacer(1, 12))
        
        # Sessions Table (preview of top 50)
        sessions = poi_data.get('sessions', [])[:50]
        if sessions:
            table_data = [["Time", "Destination IP", "Port", "Class", "Operator"]]
            for s in sessions:
                table_data.append([
                    str(s.get('started_at', '')),
                    str(s.get('destination_ip', '')),
                    str(s.get('destination_port', '')),
                    str(s.get('classification', '')),
                    str(s.get('operator', ''))
                ])
                
            t = Table(table_data)
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            elements.append(t)
            
        doc.build(elements)
        return output.getvalue()
