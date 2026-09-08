"""Regenerate synthetic PDFs using reportlab; not a production dependency."""
from pathlib import Path
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer, PageBreak

root = Path(__file__).resolve().parent
pdfmetrics.registerFont(TTFont('FixtureVN', 'C:/Windows/Fonts/arial.ttf'))
style = ParagraphStyle('body', fontName='FixtureVN', fontSize=10, leading=14)
small = ParagraphStyle('cell', fontName='FixtureVN', fontSize=9, leading=13)
story = []

def page(title, rows, widths):
    if story:
        story.append(PageBreak())
    story.extend([Paragraph(title, style), Paragraph('DỮ LIỆU GIẢ LẬP - KHÔNG DÙNG ĐỂ ĐIỀU TRỊ', style),
                  Paragraph('Họ tên: NGƯỜI MẪU A', style), Paragraph('Ngày khám: 08/09/2026', style), Spacer(1, 18)])
    table = Table([[Paragraph(cell.replace('<', '&lt;'), small) for cell in row] for row in rows], colWidths=widths)
    table.setStyle(TableStyle([('GRID', (0,0), (-1,-1), .6, colors.black), ('VALIGN', (0,0), (-1,-1), 'TOP'),
                              ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#eeeeee')),
                              ('TOPPADDING', (0,0), (-1,-1), 7), ('BOTTOMPADDING', (0,0), (-1,-1), 7)]))
    story.extend([table, Spacer(1, 16), Paragraph('Bản mẫu kiểm tra nhận diện, không phải hồ sơ người thật.', style)])

page('PHIẾU XÉT NGHIỆM MẪU', [
    ['Tên xét nghiệm', 'Kết quả', 'Đơn vị', 'Khoảng tham chiếu'],
    ['HGB', '11,2', 'g/dL', '11,0 - 16,0'], ['TSH', '< 0,01', 'mIU/L', '0,4 - 4,0'],
    ['Glucose lúc đói', '4,8', 'mmol/L', ''], ['Glucose sau 1 giờ', '7,1', 'mmol/L', ''],
    ['Glucose sau 2 giờ', '6,2', 'mmol/L', '']], [190, 90, 90, 140])
page('ĐƠN THUỐC MẪU', [
    ['Tên thuốc', 'Liều mỗi lần', 'Số lần dùng', 'Đường dùng', 'Thời gian dùng', 'Số lượng cấp', 'Cách dùng'],
    ['Sản phẩm mẫu A 0,5 mg', '1 viên', '2 lần/ngày', 'uống', '5 ngày', '10 viên', 'Sau ăn; không uống khi đói.'],
    ['Sản phẩm mẫu B 250 mcg', '2 viên', '1 lần/ngày', 'uống', '7 ngày', '14 viên', 'Không tự tăng liều.']], [116, 52, 65, 45, 55, 52, 125])
page('PHIẾU THU MẪU', [
    ['Tên dịch vụ', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Tiền tệ'],
    ['Khám mẫu A', '2', '125.000', '250.000', 'VND'],
    ['Siêu âm mẫu B', '1', '350.000', '350.000', 'VND'],
    ['Giảm giá', '', '', '50.000', 'VND'], ['Phải trả', '', '', '550.000', 'VND']], [170, 65, 95, 95, 85])
SimpleDocTemplate(str(root / 'synthetic-ruled-medical.pdf'), pagesize=(595,842), leftMargin=25, rightMargin=25, topMargin=35, bottomMargin=35).build(story)
