"""
반도체 부품·소재 수요예측 AI SaaS — 중간발표 PPT 생성
"""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
import os

# ── 색상 팔레트 ──
NAVY      = RGBColor(0x1B, 0x2B, 0x4B)
BLUE      = RGBColor(0x25, 0x63, 0xEB)
LIGHT_BLUE= RGBColor(0xDB, 0xEA, 0xFE)
WHITE     = RGBColor(0xFF, 0xFF, 0xFF)
DARK_GRAY = RGBColor(0x33, 0x33, 0x33)
MID_GRAY  = RGBColor(0x66, 0x66, 0x66)
LIGHT_GRAY= RGBColor(0xF0, 0xF4, 0xF8)
GREEN     = RGBColor(0x05, 0x96, 0x69)
AMBER     = RGBColor(0xD9, 0x77, 0x06)
RED       = RGBColor(0xDC, 0x26, 0x26)
PURPLE    = RGBColor(0x7C, 0x3A, 0xED)
TEAL      = RGBColor(0x0D, 0x94, 0x88)

prs = Presentation()
prs.slide_width  = Inches(13.333)
prs.slide_height = Inches(7.5)
W = prs.slide_width
H = prs.slide_height


# ════════════════════════════════════════════
#  유틸리티 함수
# ════════════════════════════════════════════

def add_bg(slide, color=WHITE):
    """슬라이드 배경색 설정"""
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = color

def add_rect(slide, left, top, width, height, fill_color, border_color=None):
    """사각형 도형 추가"""
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill_color
    if border_color:
        shape.line.color.rgb = border_color
        shape.line.width = Pt(1)
    else:
        shape.line.fill.background()
    return shape

def add_rounded_rect(slide, left, top, width, height, fill_color, border_color=None):
    """둥근 사각형 도형 추가"""
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill_color
    if border_color:
        shape.line.color.rgb = border_color
        shape.line.width = Pt(1)
    else:
        shape.line.fill.background()
    return shape

def add_text(slide, left, top, width, height, text, font_size=18, color=DARK_GRAY,
             bold=False, alignment=PP_ALIGN.LEFT, font_name="맑은 고딕", anchor=MSO_ANCHOR.TOP):
    """텍스트 박스 추가"""
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(font_size)
    p.font.color.rgb = color
    p.font.bold = bold
    p.font.name = font_name
    p.alignment = alignment
    try:
        tf.paragraphs[0].font.language_id = None
    except:
        pass
    return txBox

def add_multiline(slide, left, top, width, height, lines, font_size=16, color=DARK_GRAY,
                  bold=False, alignment=PP_ALIGN.LEFT, font_name="맑은 고딕", line_spacing=1.5):
    """여러 줄 텍스트 박스 추가"""
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    for i, line_text in enumerate(lines):
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        # line_text can be tuple (text, kwargs) or string
        if isinstance(line_text, tuple):
            txt, kwargs = line_text
            p.text = txt
            p.font.size = Pt(kwargs.get('size', font_size))
            p.font.color.rgb = kwargs.get('color', color)
            p.font.bold = kwargs.get('bold', bold)
            p.font.name = font_name
            p.alignment = kwargs.get('align', alignment)
            p.space_after = Pt(kwargs.get('space_after', 4))
        else:
            p.text = line_text
            p.font.size = Pt(font_size)
            p.font.color.rgb = color
            p.font.bold = bold
            p.font.name = font_name
            p.alignment = alignment
            p.space_after = Pt(4)
    return txBox

def add_card(slide, left, top, width, height, title, value, sub="",
             title_color=MID_GRAY, value_color=BLUE, bg_color=WHITE, border_color=None):
    """KPI 카드 스타일 박스"""
    card = add_rounded_rect(slide, left, top, width, height, bg_color, border_color or RGBColor(0xE2,0xE8,0xF0))
    add_text(slide, left + Inches(0.2), top + Inches(0.15), width - Inches(0.4), Inches(0.35),
             title, font_size=12, color=title_color, bold=False)
    add_text(slide, left + Inches(0.2), top + Inches(0.45), width - Inches(0.4), Inches(0.45),
             value, font_size=24, color=value_color, bold=True)
    if sub:
        add_text(slide, left + Inches(0.2), top + Inches(0.9), width - Inches(0.4), Inches(0.3),
                 sub, font_size=11, color=MID_GRAY, bold=False)

def add_section_header(slide, text, y=Inches(0.4)):
    """슬라이드 상단 섹션 헤더 바"""
    add_rect(slide, Inches(0), y, W, Inches(0.06), BLUE)
    add_text(slide, Inches(0.8), y + Inches(0.15), Inches(10), Inches(0.55),
             text, font_size=28, color=NAVY, bold=True)

def add_page_number(slide, num, total=17):
    """페이지 번호"""
    add_text(slide, W - Inches(1.2), H - Inches(0.45), Inches(1), Inches(0.35),
             f"{num} / {total}", font_size=10, color=MID_GRAY, alignment=PP_ALIGN.RIGHT)

def add_bottom_bar(slide):
    """하단 장식 바"""
    add_rect(slide, Inches(0), H - Inches(0.08), W, Inches(0.08), BLUE)

def add_placeholder_img(slide, left, top, width, height, label="스크린샷 삽입"):
    """스크린샷 placeholder"""
    shape = add_rounded_rect(slide, left, top, width, height, LIGHT_GRAY, RGBColor(0xBB,0xCC,0xDD))
    add_text(slide, left, top + height/2 - Inches(0.25), width, Inches(0.5),
             f"[ {label} ]", font_size=14, color=MID_GRAY, bold=False, alignment=PP_ALIGN.CENTER)


TOTAL_SLIDES = 17

# ════════════════════════════════════════════
#  슬라이드 1: 표지
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank
add_bg(slide, NAVY)

# 상단 장식 라인
add_rect(slide, Inches(0.8), Inches(1.5), Inches(1.5), Inches(0.06), BLUE)

add_text(slide, Inches(0.8), Inches(1.8), Inches(11), Inches(1.0),
         "반도체 부품·소재 수요예측 AI SaaS", font_size=42, color=WHITE, bold=True)
add_text(slide, Inches(0.8), Inches(2.7), Inches(11), Inches(0.6),
         "수요 변동성 분석 및 재고 리스크 최적화 플랫폼", font_size=22, color=RGBColor(0x94,0xA8,0xC8))

add_text(slide, Inches(0.8), Inches(3.8), Inches(11), Inches(0.4),
         "중간발표", font_size=20, color=BLUE, bold=True)

# 하단 정보
add_text(slide, Inches(0.8), Inches(5.5), Inches(5), Inches(0.35),
         "2026. 03. 14", font_size=16, color=RGBColor(0x94,0xA8,0xC8))
add_text(slide, Inches(0.8), Inches(5.9), Inches(5), Inches(0.35),
         "팀원: 경아 · 성민 · 지은 · 다솜", font_size=16, color=RGBColor(0x94,0xA8,0xC8))

add_rect(slide, Inches(0), H - Inches(0.06), W, Inches(0.06), BLUE)


# ════════════════════════════════════════════
#  슬라이드 2: 목차
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_section_header(slide, "목차")
add_bottom_bar(slide)
add_page_number(slide, 2)

toc_items = [
    ("01", "프로젝트 배경 및 목표"),
    ("02", "시스템 아키텍처"),
    ("03", "데이터 현황"),
    ("04", "ML 파이프라인"),
    ("05", "모델 성능 비교"),
    ("06", "핵심 기능 — 대시보드"),
    ("07", "핵심 기능 — 수요예측"),
    ("08", "핵심 기능 — 리스크 관리"),
    ("09", "핵심 기능 — 최적화"),
    ("10", "핵심 기능 — 외부지표·AI 인사이트"),
    ("11", "개발 진행 현황"),
    ("12", "팀 구성 및 역할"),
    ("13", "향후 계획"),
    ("14", "Q&A"),
]

col1 = toc_items[:7]
col2 = toc_items[7:]

for i, (num, title) in enumerate(col1):
    y = Inches(1.3) + Inches(i * 0.7)
    add_text(slide, Inches(1.2), y, Inches(0.6), Inches(0.45),
             num, font_size=22, color=BLUE, bold=True)
    add_text(slide, Inches(1.9), y + Inches(0.03), Inches(4.5), Inches(0.45),
             title, font_size=17, color=DARK_GRAY)

for i, (num, title) in enumerate(col2):
    y = Inches(1.3) + Inches(i * 0.7)
    add_text(slide, Inches(7.2), y, Inches(0.6), Inches(0.45),
             num, font_size=22, color=BLUE, bold=True)
    add_text(slide, Inches(7.9), y + Inches(0.03), Inches(4.5), Inches(0.45),
             title, font_size=17, color=DARK_GRAY)


# ════════════════════════════════════════════
#  슬라이드 3: 프로젝트 배경
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_section_header(slide, "01  프로젝트 배경 및 목표")
add_bottom_bar(slide)
add_page_number(slide, 3)

# 배경 박스들
problems = [
    ("수요 변동성", "반도체 부품·소재는 수주 변동이 크고\n예측이 어려워 재고 과잉/결품 발생"),
    ("수동 의사결정", "경험 기반 발주·생산 결정으로\n비효율과 리스크 누적"),
    ("정보 분산", "ERP, 엑셀, 외부지표 등\n데이터가 분산되어 통합 분석 불가"),
]

for i, (title, desc) in enumerate(problems):
    left = Inches(0.8) + Inches(i * 4.0)
    card = add_rounded_rect(slide, left, Inches(1.3), Inches(3.6), Inches(2.0),
                            LIGHT_BLUE, BLUE)
    add_text(slide, left + Inches(0.25), Inches(1.5), Inches(3.1), Inches(0.45),
             title, font_size=20, color=NAVY, bold=True)
    add_multiline(slide, left + Inches(0.25), Inches(2.0), Inches(3.1), Inches(1.2),
                  desc.split('\n'), font_size=14, color=DARK_GRAY)

# 화살표 영역
add_text(slide, Inches(0.8), Inches(3.5), W - Inches(1.6), Inches(0.5),
         "▼  해결 방안", font_size=16, color=BLUE, bold=True, alignment=PP_ALIGN.CENTER)

# 목표 박스
goals = [
    ("AI 수요예측", "LightGBM 분위 회귀 기반\nP10/P50/P90 밴드 예측"),
    ("리스크 자동 스코어링", "결품·과잉·납기·마진\n4차원 리스크 점수 + A~F 등급"),
    ("생산·발주 최적화", "리스크 연동 생산 권고\nEOQ 기반 발주 최적화"),
    ("통합 대시보드", "13개 페이지 웹 SaaS\n실시간 모니터링 + AI 인사이트"),
]

for i, (title, desc) in enumerate(goals):
    left = Inches(0.5) + Inches(i * 3.15)
    card = add_rounded_rect(slide, left, Inches(4.15), Inches(2.95), Inches(2.5),
                            WHITE, BLUE)
    add_text(slide, left + Inches(0.2), Inches(4.35), Inches(2.55), Inches(0.4),
             title, font_size=17, color=BLUE, bold=True)
    add_multiline(slide, left + Inches(0.2), Inches(4.8), Inches(2.55), Inches(1.5),
                  desc.split('\n'), font_size=13, color=DARK_GRAY)


# ════════════════════════════════════════════
#  슬라이드 4: 시스템 아키텍처
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_section_header(slide, "02  시스템 아키텍처")
add_bottom_bar(slide)
add_page_number(slide, 4)

# 3-tier 아키텍처 다이어그램
layers = [
    ("Frontend", "Next.js 14 + React 18 + TypeScript\nRecharts 차트 · Pretendard 폰트\n13개 페이지 SPA + 반응형 UI", LIGHT_BLUE, BLUE),
    ("Backend / API", "Next.js API Routes (40+ 엔드포인트)\nSupabase Auth (JWT · RBAC 4단계)\nGPT-4o-mini AI 인사이트 (6h 캐시)", RGBColor(0xEC,0xFD,0xF5), GREEN),
    ("Database", "Supabase PostgreSQL\n23+ 테이블 · 524K+ rows\nRPC 최적화 · 30s API 캐시", RGBColor(0xFE,0xF3,0xC7), AMBER),
    ("ML Pipeline", "Python · LightGBM Quantile · Ridge · SVR\n13단계 파이프라인 (S0~S8)\n7종 학습 모델 · 구간별 자동 선택", RGBColor(0xF3,0xE8,0xFF), PURPLE),
]

for i, (title, desc, bg_col, border) in enumerate(layers):
    y = Inches(1.2) + Inches(i * 1.45)
    add_rounded_rect(slide, Inches(0.8), y, Inches(2.8), Inches(1.3), bg_col, border)
    add_text(slide, Inches(1.0), y + Inches(0.1), Inches(2.4), Inches(0.35),
             title, font_size=16, color=border, bold=True, alignment=PP_ALIGN.CENTER)
    add_multiline(slide, Inches(1.0), y + Inches(0.45), Inches(2.4), Inches(0.8),
                  desc.split('\n'), font_size=11, color=DARK_GRAY, alignment=PP_ALIGN.CENTER)

# 오른쪽: 데이터 흐름도
add_text(slide, Inches(4.5), Inches(1.2), Inches(4), Inches(0.4),
         "데이터 흐름", font_size=18, color=NAVY, bold=True)

flow_items = [
    "CSV 원천 데이터 9종 (수주/매출/생산/재고/발주/BOM/제품/고객/거래처)",
    "   ▼  Python ETL → Supabase 적재",
    "S0: 주간/고객별 집계 (54K+34K건)",
    "S1: 일간 재고 추정 (617K건)",
    "S2: 리드타임 산출 (2.1K건)",
    "S3: 피처 스토어 구축 (83.7K건)",
    "   ▼  ML 학습 & 추론",
    "S4: 수요예측 — LightGBM/Ridge/SVR (351K건)",
    "S4S: 구간별 최적 모델 선택 (11.4K건)",
    "S5: 리스크 점수 산출 (39.9K건)",
    "S6: 조치 큐 생성 (10.6K건)",
    "S7: 생산 권고 생성",
    "S8: 구매 권고 생성 (EOQ)",
    "   ▼  API 서빙 → 프론트엔드",
]

for i, item in enumerate(flow_items):
    y = Inches(1.65) + Inches(i * 0.37)
    c = BLUE if item.startswith("   ▼") else DARK_GRAY
    b = item.startswith("   ▼")
    sz = 11 if not b else 10
    add_text(slide, Inches(4.5), y, Inches(5), Inches(0.35),
             item, font_size=sz, color=c, bold=b)

# 오른쪽: 기술 스택 요약
add_text(slide, Inches(10), Inches(1.2), Inches(3), Inches(0.4),
         "기술 스택", font_size=18, color=NAVY, bold=True)

tech_items = [
    ("Language", "Python 3.14 / TypeScript 5"),
    ("Frontend", "Next.js 14 + React 18"),
    ("Charts", "Recharts 2.12"),
    ("Auth", "Supabase Auth (JWT)"),
    ("DB", "PostgreSQL (Supabase)"),
    ("ML", "LightGBM · Ridge · SVR"),
    ("AI", "GPT-4o-mini (인사이트)"),
    ("배포 예정", "Vercel + Supabase Cloud"),
]

for i, (k, v) in enumerate(tech_items):
    y = Inches(1.65) + Inches(i * 0.6)
    add_text(slide, Inches(10), y, Inches(1.4), Inches(0.3),
             k, font_size=11, color=MID_GRAY, bold=True)
    add_text(slide, Inches(10), y + Inches(0.22), Inches(3), Inches(0.3),
             v, font_size=12, color=DARK_GRAY)


# ════════════════════════════════════════════
#  슬라이드 5: 데이터 현황
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_section_header(slide, "03  데이터 현황")
add_bottom_bar(slide)
add_page_number(slide, 5)

# 내부 데이터
add_text(slide, Inches(0.8), Inches(1.2), Inches(5), Inches(0.4),
         "내부 데이터 (9종 CSV)", font_size=20, color=NAVY, bold=True)

data_items = [
    ("일별수주", "핵심 입력 — 수요 변동성 분석 기반"),
    ("일별매출", "수요-매출 갭 분석"),
    ("일별생산", "생산 캐파 분석"),
    ("재고", "리스크 점수 산정 기반"),
    ("구매발주", "리드타임 분석"),
    ("제품마스터", "제품 분류·속성 정보"),
    ("BOM", "소재→부품 연결 관계"),
    ("고객사", "고객별 수요 패턴 분석"),
    ("거래처", "공급 리드타임·안정성"),
]

for i, (name, desc) in enumerate(data_items):
    row = i % 5
    col = i // 5
    x = Inches(0.8) + Inches(col * 5.5)
    y = Inches(1.75) + Inches(row * 0.55)
    add_rounded_rect(slide, x, y, Inches(1.3), Inches(0.42), LIGHT_BLUE, BLUE)
    add_text(slide, x + Inches(0.1), y + Inches(0.05), Inches(1.1), Inches(0.32),
             name, font_size=12, color=NAVY, bold=True, alignment=PP_ALIGN.CENTER)
    add_text(slide, x + Inches(1.45), y + Inches(0.05), Inches(3.8), Inches(0.32),
             desc, font_size=12, color=DARK_GRAY)

# 외부 데이터
add_text(slide, Inches(0.8), Inches(4.7), Inches(5), Inches(0.4),
         "외부 지표 데이터 (18종)", font_size=20, color=NAVY, bold=True)

ext_groups = [
    ("반도체 지표", "SOX 지수, DRAM/NAND 가격, 실리콘 웨이퍼"),
    ("글로벌 수요", "산업생산지수(INDPRO), PMI, 제조업IP, HS8541 무역"),
    ("환율·금리", "KRW/JPY/USD 환율, 기준금리, IPI, BSI"),
    ("물류", "BDI (발틱운임지수)"),
    ("원자재", "WTI 유가, 구리 가격"),
]

for i, (cat, desc) in enumerate(ext_groups):
    x = Inches(0.8)
    y = Inches(5.25) + Inches(i * 0.4)
    add_text(slide, x, y, Inches(1.8), Inches(0.3),
             cat, font_size=13, color=BLUE, bold=True)
    add_text(slide, x + Inches(2.0), y, Inches(6), Inches(0.3),
             desc, font_size=13, color=DARK_GRAY)

# 우측: DB 통계 카드
add_card(slide, Inches(9.5), Inches(1.5), Inches(3.2), Inches(1.2),
         "DB 테이블", "23+", "PostgreSQL (Supabase)", value_color=NAVY)
add_card(slide, Inches(9.5), Inches(2.9), Inches(3.2), Inches(1.2),
         "총 데이터", "524K+ rows", "forecast_result 단일 테이블 기준", value_color=BLUE)
add_card(slide, Inches(9.5), Inches(4.3), Inches(3.2), Inches(1.2),
         "외부 지표 소스", "5개 API", "FRED · Yahoo · ECOS · EIA · 관세청", value_color=GREEN)
add_card(slide, Inches(9.5), Inches(5.7), Inches(3.2), Inches(1.2),
         "학습 모델", "7종", "LightGBM 4종 + Ridge + SVR + Selector", value_color=PURPLE)


# ════════════════════════════════════════════
#  슬라이드 6: ML 파이프라인
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_section_header(slide, "04  ML 파이프라인")
add_bottom_bar(slide)
add_page_number(slide, 6)

pipeline_steps = [
    ("S0", "집계", "주간/고객별 집계\n54K+34K건", RGBColor(0x25,0x63,0xEB)),
    ("S1", "재고", "일간 재고 추정\n617K건", RGBColor(0x25,0x63,0xEB)),
    ("S2", "리드타임", "리드타임 산출\n2.1K건", RGBColor(0x25,0x63,0xEB)),
    ("S3", "피처", "피처 스토어 구축\n83.7K건", RGBColor(0x25,0x63,0xEB)),
    ("S4", "예측", "LightGBM 분위 회귀\n351K건", PURPLE),
    ("S4S", "모델선택", "구간별 최적 모델\n11.4K건", PURPLE),
    ("S5", "리스크", "4차원 리스크 점수\n39.9K건", RED),
    ("S6", "조치큐", "AI 조치 큐 생성\n10.6K건", AMBER),
    ("S7", "생산", "생산 권고\nP90/동적 기반", GREEN),
    ("S8", "발주", "구매 최적화\nEOQ+fallback", GREEN),
]

for i, (step_id, label, desc, color) in enumerate(pipeline_steps):
    col = i % 5
    row = i // 5
    x = Inches(0.5) + Inches(col * 2.5)
    y = Inches(1.3) + Inches(row * 2.8)

    # 화살표 (마지막 아이템 제외)
    if col < 4 and i < len(pipeline_steps) - 1:
        add_text(slide, x + Inches(2.15), y + Inches(0.5), Inches(0.3), Inches(0.4),
                 "→", font_size=20, color=MID_GRAY, bold=True)

    add_rounded_rect(slide, x, y, Inches(2.1), Inches(1.6), WHITE, color)
    # 상단 라벨 바
    add_rect(slide, x, y, Inches(2.1), Inches(0.45), color)
    add_text(slide, x + Inches(0.1), y + Inches(0.05), Inches(0.5), Inches(0.35),
             step_id, font_size=13, color=WHITE, bold=True)
    add_text(slide, x + Inches(0.7), y + Inches(0.05), Inches(1.3), Inches(0.35),
             label, font_size=13, color=WHITE, bold=True)
    add_multiline(slide, x + Inches(0.15), y + Inches(0.55), Inches(1.8), Inches(1.0),
                  desc.split('\n'), font_size=12, color=DARK_GRAY, alignment=PP_ALIGN.CENTER)

# 하단 설명
add_text(slide, Inches(0.8), Inches(6.5), Inches(11), Inches(0.4),
         "전처리 → 피처 엔지니어링 → 예측 → 리스크 → 의사결정 지원의 End-to-End 파이프라인",
         font_size=15, color=MID_GRAY, alignment=PP_ALIGN.CENTER)


# ════════════════════════════════════════════
#  슬라이드 7: 모델 성능 비교
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_section_header(slide, "05  모델 성능 비교")
add_bottom_bar(slide)
add_page_number(slide, 7)

# 주간 모델 테이블
add_text(slide, Inches(0.8), Inches(1.2), Inches(5), Inches(0.4),
         "주간 예측 모델 비교", font_size=20, color=NAVY, bold=True)

# 테이블 헤더
headers = ["모델", "R²", "MAE", "±5 허용오차", "비고"]
col_widths = [Inches(2.2), Inches(1.0), Inches(1.0), Inches(1.5), Inches(1.8)]
x_start = Inches(0.8)
y_header = Inches(1.7)

for j, (h, w) in enumerate(zip(headers, col_widths)):
    x = x_start + sum(cw for cw in col_widths[:j])
    add_rect(slide, x, y_header, w, Inches(0.4), NAVY)
    add_text(slide, x + Inches(0.1), y_header + Inches(0.05), w - Inches(0.2), Inches(0.3),
             h, font_size=12, color=WHITE, bold=True, alignment=PP_ALIGN.CENTER)

rows_weekly = [
    ("LightGBM v3 (정규화)", "0.27", "49.7", "6.5%", "★ 주간 Best"),
    ("LightGBM v4 (2-Stage)", "—", "—", "WMAPE 39.7~71%", "v3 대비 22%↑"),
    ("Ridge Regression", "0.26", "42.3", "60.2%", "저수요 대안"),
    ("Linear SVR", "0.02", "39.3", "62.6%", "±5 최고"),
    ("Random Forest", "0.27", "50.2", "15.4%", "앙상블 비교"),
    ("Segment Selector", "—", "—", "—", "구간별 자동선택"),
]

for i, row_data in enumerate(rows_weekly):
    y = y_header + Inches(0.4) + Inches(i * 0.38)
    bg = LIGHT_BLUE if i % 2 == 0 else WHITE
    for j, (val, w) in enumerate(zip(row_data, col_widths)):
        x = x_start + sum(cw for cw in col_widths[:j])
        add_rect(slide, x, y, w, Inches(0.38), bg)
        c = BLUE if "★" in val or "↑" in val else DARK_GRAY
        b = "★" in val or "↑" in val
        add_text(slide, x + Inches(0.1), y + Inches(0.05), w - Inches(0.2), Inches(0.28),
                 val, font_size=11, color=c, bold=b, alignment=PP_ALIGN.CENTER)

# 월간 모델
add_text(slide, Inches(0.8), Inches(4.3), Inches(5), Inches(0.4),
         "월간 예측 모델 비교", font_size=20, color=NAVY, bold=True)

y_header2 = Inches(4.75)
for j, (h, w) in enumerate(zip(headers, col_widths)):
    x = x_start + sum(cw for cw in col_widths[:j])
    add_rect(slide, x, y_header2, w, Inches(0.4), NAVY)
    add_text(slide, x + Inches(0.1), y_header2 + Inches(0.05), w - Inches(0.2), Inches(0.3),
             h, font_size=12, color=WHITE, bold=True, alignment=PP_ALIGN.CENTER)

rows_monthly = [
    ("LightGBM v1 (베이스라인)", "0.64", "59.6", "5.8%", "★ 월간 Best"),
    ("LightGBM v2 (WMAPE)", "—", "—", "WMAPE 43~66%", "v2 분기별"),
    ("Ridge Regression", "0.69", "54.3", "27.6%", "R² 최고"),
    ("Linear SVR", "0.68", "49.2", "47.8%", "MAE 최저"),
]

for i, row_data in enumerate(rows_monthly):
    y = y_header2 + Inches(0.4) + Inches(i * 0.38)
    bg = LIGHT_BLUE if i % 2 == 0 else WHITE
    for j, (val, w) in enumerate(zip(row_data, col_widths)):
        x = x_start + sum(cw for cw in col_widths[:j])
        add_rect(slide, x, y, w, Inches(0.38), bg)
        c = BLUE if "★" in val else DARK_GRAY
        b = "★" in val
        add_text(slide, x + Inches(0.1), y + Inches(0.05), w - Inches(0.2), Inches(0.28),
                 val, font_size=11, color=c, bold=b, alignment=PP_ALIGN.CENTER)

# 오른쪽: 핵심 전략 설명
add_rounded_rect(slide, Inches(8.5), Inches(1.3), Inches(4.3), Inches(5.5),
                 RGBColor(0xF8,0xFA,0xFC), BLUE)
add_text(slide, Inches(8.8), Inches(1.5), Inches(3.7), Inches(0.4),
         "핵심 전략: 구간별 모델 선택", font_size=17, color=BLUE, bold=True)

strategy_lines = [
    "저수요 구간 (일평균 < 10)",
    "  → Linear SVR (±5 허용오차 62.6%)",
    "",
    "중수요 구간 (10 ~ 100)",
    "  → LightGBM v3 (R² 0.27)",
    "",
    "고수요 구간 (> 100)",
    "  → LightGBM / Ridge (R² 우위)",
    "",
    "segment_best_v1 자동 선택기가",
    "제품별 최적 모델을 자동 배정",
    "(총 11,431건 선택 완료)",
    "",
    "v4 2-Stage 글로벌 모델",
    "  → 분류(zero/non-zero) + 회귀",
    "  → WMAPE 22% 개선 달성",
]

for i, line in enumerate(strategy_lines):
    y = Inches(2.0) + Inches(i * 0.3)
    c = BLUE if line.startswith("  →") else (NAVY if line and not line.startswith("(") else MID_GRAY)
    b = not line.startswith("  ") and not line.startswith("(") and line != ""
    add_text(slide, Inches(8.8), y, Inches(3.7), Inches(0.3),
             line, font_size=12, color=c, bold=b)


# ════════════════════════════════════════════
#  슬라이드 8: 핵심 기능 — 대시보드
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_section_header(slide, "06  핵심 기능 — 대시보드")
add_bottom_bar(slide)
add_page_number(slide, 8)

add_placeholder_img(slide, Inches(0.8), Inches(1.3), Inches(8), Inches(5.5),
                    "대시보드 (Dashboard.tsx) 스크린샷")

# 오른쪽 설명
features_dash = [
    "7개 KPI 영역 실데이터 연동",
    "수주 예측 차트 (P10/P50/P90)",
    "리스크 등급 분포 (A~F 파이차트)",
    "AI 조치 항목 테이블",
    "GPT-4o-mini AI 인사이트",
    "실시간 알림 (결품/E·F등급/PO)",
    "주간 경영 요약 리포트",
    "Supabase RPC 최적화",
]

add_text(slide, Inches(9.2), Inches(1.3), Inches(3.5), Inches(0.4),
         "주요 기능", font_size=18, color=NAVY, bold=True)

for i, feat in enumerate(features_dash):
    y = Inches(1.85) + Inches(i * 0.52)
    add_rounded_rect(slide, Inches(9.2), y, Inches(0.28), Inches(0.28), BLUE)
    add_text(slide, Inches(9.2), y - Inches(0.02), Inches(0.28), Inches(0.28),
             "✓", font_size=11, color=WHITE, bold=True, alignment=PP_ALIGN.CENTER)
    add_text(slide, Inches(9.6), y, Inches(3.2), Inches(0.35),
             feat, font_size=13, color=DARK_GRAY)


# ════════════════════════════════════════════
#  슬라이드 9: 핵심 기능 — 수요예측
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_section_header(slide, "07  핵심 기능 — 수요예측")
add_bottom_bar(slide)
add_page_number(slide, 9)

# 주간 예측
add_text(slide, Inches(0.8), Inches(1.2), Inches(5), Inches(0.4),
         "주간 예측 (WeeklyForecast.tsx)", font_size=18, color=NAVY, bold=True)
add_placeholder_img(slide, Inches(0.8), Inches(1.7), Inches(5.5), Inches(3.5),
                    "주간 예측 화면 스크린샷")

# 월간 예측
add_text(slide, Inches(6.8), Inches(1.2), Inches(5), Inches(0.4),
         "월간 예측 (MonthlyForecast.tsx)", font_size=18, color=NAVY, bold=True)
add_placeholder_img(slide, Inches(6.8), Inches(1.7), Inches(5.5), Inches(3.5),
                    "월간 예측 화면 스크린샷")

# 하단 기능 설명
features_forecast = [
    ("P10/P50/P90 밴드", "분위 회귀로 불확실성 시각화"),
    ("5개 모델 비교", "LightGBM, Ridge, SVR, v4, Segment"),
    ("조회 범위 선택", "고객사/제품/기간 동적 필터"),
    ("모델 평가", "기간별 MAPE/MAE/Coverage 추이"),
]

for i, (title, desc) in enumerate(features_forecast):
    x = Inches(0.8) + Inches(i * 3.1)
    y = Inches(5.5)
    add_rounded_rect(slide, x, y, Inches(2.9), Inches(1.2), LIGHT_BLUE, BLUE)
    add_text(slide, x + Inches(0.15), y + Inches(0.1), Inches(2.6), Inches(0.35),
             title, font_size=14, color=NAVY, bold=True)
    add_text(slide, x + Inches(0.15), y + Inches(0.5), Inches(2.6), Inches(0.5),
             desc, font_size=12, color=DARK_GRAY)


# ════════════════════════════════════════════
#  슬라이드 10: 핵심 기능 — 리스크 관리
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_section_header(slide, "08  핵심 기능 — 리스크 관리")
add_bottom_bar(slide)
add_page_number(slide, 10)

add_placeholder_img(slide, Inches(0.8), Inches(1.3), Inches(5.5), Inches(3.0),
                    "리스크 관리 (RiskManagement.tsx) 스크린샷")
add_placeholder_img(slide, Inches(6.8), Inches(1.3), Inches(5.7), Inches(3.0),
                    "재고 현황 (Inventory.tsx) 스크린샷")

# 하단 설명
risk_features = [
    ("4차원 리스크", "결품(35%) · 과잉(25%)\n납기(25%) · 마진(15%)\n불균등 가중치 적용", RED),
    ("A~F 등급 체계", "A(0~15): 안전\nF(81~100): 긴급\nC등급 이상 조치 큐 생성", AMBER),
    ("재고 대시보드", "월별 KPI 카드\n재고 커버리지 분석\n30s API 캐시 성능최적화", BLUE),
    ("AI 조치 큐", "AI 추천 액션 목록\n심각도 필터링\n상세 모달 + 수요예측 연계", PURPLE),
]

for i, (title, desc, color) in enumerate(risk_features):
    x = Inches(0.5) + Inches(i * 3.15)
    y = Inches(4.6)
    add_rounded_rect(slide, x, y, Inches(2.95), Inches(2.3), WHITE, color)
    add_rect(slide, x, y, Inches(2.95), Inches(0.45), color)
    add_text(slide, x + Inches(0.15), y + Inches(0.07), Inches(2.65), Inches(0.3),
             title, font_size=14, color=WHITE, bold=True, alignment=PP_ALIGN.CENTER)
    add_multiline(slide, x + Inches(0.2), y + Inches(0.55), Inches(2.55), Inches(1.6),
                  desc.split('\n'), font_size=12, color=DARK_GRAY, alignment=PP_ALIGN.CENTER)


# ════════════════════════════════════════════
#  슬라이드 11: 핵심 기능 — 최적화
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_section_header(slide, "09  핵심 기능 — 최적화")
add_bottom_bar(slide)
add_page_number(slide, 11)

add_placeholder_img(slide, Inches(0.8), Inches(1.3), Inches(5.5), Inches(2.6),
                    "시나리오 분석 (Simulation.tsx) 스크린샷")
add_placeholder_img(slide, Inches(6.8), Inches(1.3), Inches(5.7), Inches(2.6),
                    "구매 권고 (Purchase.tsx) 스크린샷")

# 기능 카드들
opt_features = [
    ("생산 권고 (S7)", "리스크별 동적 생산량\n결품 위험 → P90 기준\n과잉 위험 → 10% 감량", GREEN),
    ("구매 최적화 (S8)", "EOQ 기반 최적 발주량\n불가 시 lot-for-lot 자동 전환\n공급사 종합점수 추천", BLUE),
    ("시나리오 분석", "3탭 시나리오 (결품/균형/린)\n8개 산업 템플릿\nsegment_best_v1 연동", PURPLE),
    ("시나리오→구매 연계", "SessionStorage 기반\n제품·리스크 정보 자동 전달\n컨텍스트 배너 표시", TEAL),
]

for i, (title, desc, color) in enumerate(opt_features):
    x = Inches(0.5) + Inches(i * 3.15)
    y = Inches(4.2)
    add_rounded_rect(slide, x, y, Inches(2.95), Inches(2.5), WHITE, color)
    add_rect(slide, x, y, Inches(2.95), Inches(0.45), color)
    add_text(slide, x + Inches(0.15), y + Inches(0.07), Inches(2.65), Inches(0.3),
             title, font_size=14, color=WHITE, bold=True, alignment=PP_ALIGN.CENTER)
    add_multiline(slide, x + Inches(0.2), y + Inches(0.55), Inches(2.55), Inches(1.8),
                  desc.split('\n'), font_size=12, color=DARK_GRAY, alignment=PP_ALIGN.CENTER)


# ════════════════════════════════════════════
#  슬라이드 12: 핵심 기능 — 외부지표·AI
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_section_header(slide, "10  핵심 기능 — 외부지표 · AI 인사이트")
add_bottom_bar(slide)
add_page_number(slide, 12)

add_placeholder_img(slide, Inches(0.8), Inches(1.3), Inches(5.5), Inches(3.5),
                    "외부지표 (ExternalIndicators.tsx) 스크린샷")
add_placeholder_img(slide, Inches(6.8), Inches(1.3), Inches(5.7), Inches(3.5),
                    "AI 인사이트 화면 스크린샷")

# 하단
ext_feat = [
    ("18개 외부 지표", "5개 카테고리\n(반도체/글로벌/환율/물류/원자재)\nDB + Yahoo + FRED 멀티소스"),
    ("AI 트렌드 분석", "GPT-4o-mini 기반\n지표 트렌드 자연어 해석\n경영 의사결정 지원"),
    ("실시간 알림", "Critical 리스크 즉시 알림\nE·F 등급 제품 경고\nPO 납기 임박 알림"),
    ("주간 경영 리포트", "자동 생성 주간 요약\nKPI 달성률 + 리스크 추이\n경영진 보고용 포맷"),
]

for i, (title, desc, ) in enumerate(ext_feat):
    x = Inches(0.5) + Inches(i * 3.15)
    y = Inches(5.1)
    add_rounded_rect(slide, x, y, Inches(2.95), Inches(1.8), LIGHT_BLUE, BLUE)
    add_text(slide, x + Inches(0.15), y + Inches(0.1), Inches(2.65), Inches(0.35),
             title, font_size=14, color=NAVY, bold=True)
    add_multiline(slide, x + Inches(0.15), y + Inches(0.5), Inches(2.65), Inches(1.2),
                  desc.split('\n'), font_size=11, color=DARK_GRAY)


# ════════════════════════════════════════════
#  슬라이드 13: 개발 진행 현황
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_section_header(slide, "11  개발 진행 현황")
add_bottom_bar(slide)
add_page_number(slide, 13)

# Phase 진행 바
phases = [
    ("Phase 1", "데이터 탐색·전처리", 100, GREEN),
    ("Phase 2", "수요 변동성 분석 모델", 100, GREEN),
    ("Phase 3", "재고 리스크 점수화", 100, GREEN),
    ("Phase 4", "생산·발주 최적화", 100, GREEN),
    ("Phase 5", "웹 대시보드 & API", 100, GREEN),
    ("Phase 6", "통합 테스트·배포", 0, MID_GRAY),
]

for i, (phase, desc, pct, color) in enumerate(phases):
    y = Inches(1.3) + Inches(i * 0.75)
    # Phase 라벨
    add_text(slide, Inches(0.8), y, Inches(1.2), Inches(0.35),
             phase, font_size=14, color=NAVY, bold=True)
    add_text(slide, Inches(2.1), y, Inches(3), Inches(0.35),
             desc, font_size=13, color=DARK_GRAY)
    # Progress bar background
    bar_x = Inches(5.5)
    bar_w = Inches(4.5)
    add_rounded_rect(slide, bar_x, y + Inches(0.05), bar_w, Inches(0.3), LIGHT_GRAY)
    if pct > 0:
        add_rounded_rect(slide, bar_x, y + Inches(0.05),
                        Inches(4.5 * pct / 100), Inches(0.3), color)
    add_text(slide, bar_x + bar_w + Inches(0.15), y, Inches(0.8), Inches(0.35),
             f"{pct}%", font_size=13, color=color, bold=True)

# 핵심 수치 카드
add_text(slide, Inches(0.8), Inches(5.8), Inches(3), Inches(0.4),
         "핵심 수치", font_size=20, color=NAVY, bold=True)

stats = [
    ("전체 페이지", "13개", "100% 완료"),
    ("API 라우트", "40+", "100% 실데이터"),
    ("ML 파이프라인", "13 step", "S0~S8 완료"),
    ("개발 기간", "15일", "4명 협업"),
    ("누적 의사결정", "24건", "전원 참여"),
]

for i, (label, value, sub) in enumerate(stats):
    x = Inches(0.6) + Inches(i * 2.5)
    add_card(slide, x, Inches(6.2), Inches(2.2), Inches(1.1),
             label, value, sub, value_color=BLUE)


# ════════════════════════════════════════════
#  슬라이드 14: 페이지 전체 맵
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_section_header(slide, "11-2  전체 페이지 맵 (13개)")
add_bottom_bar(slide)
add_page_number(slide, 14)

page_groups = [
    ("메인", [("대시보드", "KPI·차트·AI인사이트")], BLUE),
    ("재고 관리", [("재고 현황", "월별 대시보드"), ("리스크 관리", "A~F 등급"), ("생산 권고", "AI 추천 액션")], RED),
    ("수요예측", [("주간 예측", "P10/P50/P90"), ("월간 예측", "장기 트렌드"), ("모델 평가", "성능 비교")], PURPLE),
    ("최적화", [("구매 권고", "EOQ 최적화"), ("시나리오 분석", "What-if"), ("AI 시나리오", "모델 선택")], GREEN),
    ("외부 지표", [("산업 지표", "SOX/DRAM"), ("글로벌 수요", "IPI/PMI"), ("환율·금리", "FX"), ("물류", "BDI"), ("원자재", "WTI/Cu")], AMBER),
    ("관리", [("로그인", "Supabase Auth"), ("관리자", "RBAC 4단계")], TEAL),
]

y_offset = Inches(1.2)
for gi, (group_name, pages, color) in enumerate(page_groups):
    # 그룹 라벨
    y = y_offset
    add_rounded_rect(slide, Inches(0.5), y, Inches(1.6), Inches(0.45), color)
    add_text(slide, Inches(0.55), y + Inches(0.07), Inches(1.5), Inches(0.3),
             group_name, font_size=13, color=WHITE, bold=True, alignment=PP_ALIGN.CENTER)

    # 페이지 카드들
    for pi, (page_name, page_desc) in enumerate(pages):
        x = Inches(2.4) + Inches(pi * 2.2)
        add_rounded_rect(slide, x, y, Inches(2.0), Inches(0.45), WHITE, color)
        add_text(slide, x + Inches(0.1), y + Inches(0.02), Inches(1.0), Inches(0.22),
                 page_name, font_size=11, color=color, bold=True)
        add_text(slide, x + Inches(0.1), y + Inches(0.22), Inches(1.8), Inches(0.2),
                 page_desc, font_size=9, color=MID_GRAY)

    y_offset += Inches(0.65)


# ════════════════════════════════════════════
#  슬라이드 15: 팀 구성
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_section_header(slide, "12  팀 구성 및 역할")
add_bottom_bar(slide)
add_page_number(slide, 15)

team_members = [
    ("경아 (kyoungaMin)", "PM / ML / 최적화",
     ["프로젝트 매니저 · 전체 아키텍처 설계",
      "ML 파이프라인 13단계 구축 (S0~S8)",
      "LightGBM 7종 모델 학습·평가",
      "구간별 모델 선택기 (segment_best_v1)",
      "Simulation.tsx · Purchase.tsx 개발",
      "24건 의사결정 기록 · 개발일지 관리"], BLUE),
    ("성민 (KoraenDavid)", "재고 관리 개발",
     ["Inventory.tsx — 월별 재고 대시보드",
      "RiskManagement.tsx — A-F 등급 필터",
      "ActionQueue.tsx — AI 추천 액션 큐",
      "30s API 캐시 성능 최적화",
      "KPI 카드 컴포넌트 개발"], GREEN),
    ("지은 (jieun)", "수요예측 · 외부지표",
     ["WeeklyForecast.tsx — 주간 예측 UI",
      "MonthlyForecast.tsx — 월간 예측 UI",
      "ExternalIndicators.tsx — 18개 지표",
      "ModelEvaluation.tsx — 모델 평가",
      "5개 외부 데이터 소스 연동"], PURPLE),
    ("다솜 (dasom)", "대시보드 · 인증",
     ["Dashboard.tsx — 7 KPI 영역 대시보드",
      "Login.tsx — Supabase Auth 연동",
      "Admin.tsx — 사용자 CRUD + RBAC",
      "실시간 알림 시스템 구현",
      "주간 경영 리포트 UI"], AMBER),
]

for i, (name, role, tasks, color) in enumerate(team_members):
    x = Inches(0.4) + Inches(i * 3.2)
    # 이름 카드
    add_rounded_rect(slide, x, Inches(1.3), Inches(3.0), Inches(5.5), WHITE, color)
    add_rect(slide, x, Inches(1.3), Inches(3.0), Inches(0.9), color)
    add_text(slide, x + Inches(0.2), Inches(1.4), Inches(2.6), Inches(0.45),
             name, font_size=16, color=WHITE, bold=True, alignment=PP_ALIGN.CENTER)
    add_text(slide, x + Inches(0.2), Inches(1.8), Inches(2.6), Inches(0.35),
             role, font_size=13, color=RGBColor(0xDD,0xEE,0xFF), alignment=PP_ALIGN.CENTER)

    for j, task in enumerate(tasks):
        y = Inches(2.4) + Inches(j * 0.6)
        add_text(slide, x + Inches(0.15), y, Inches(2.7), Inches(0.55),
                 f"• {task}", font_size=11, color=DARK_GRAY)


# ════════════════════════════════════════════
#  슬라이드 16: 향후 계획
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_section_header(slide, "13  향후 계획")
add_bottom_bar(slide)
add_page_number(slide, 16)

# Phase 6 상세
add_text(slide, Inches(0.8), Inches(1.2), Inches(5), Inches(0.4),
         "Phase 6 — 통합 테스트·배포", font_size=20, color=NAVY, bold=True)

phase6_items = [
    ("테스트", [
        "E2E 기능 테스트 — 13개 페이지 전체 시나리오",
        "API 정합성 검증 — 40+ API 스키마 일관성",
        "데이터 정합성 — forecast↔risk↔action 매칭",
        "크로스 브라우저 + 모바일 반응형 확인",
    ], RED),
    ("배포", [
        "Vercel 배포 — Next.js 빌드, 환경변수, 도메인",
        "Supabase 프로덕션 — Auth URL, RLS, API 키",
        "TypeScript strict 모드 빌드 에러 해결",
    ], BLUE),
    ("자동화", [
        "외부 데이터 정기 수집 스케줄러 (cron)",
        "ML 파이프라인 주 1회 자동 실행",
        "모니터링/알림 — API 에러율, DB 상태",
    ], GREEN),
    ("문서화", [
        "사용자 매뉴얼 — 기능별 가이드",
        "API 문서 — OpenAPI 기반",
        "운영 매뉴얼 — 장애 대응 절차",
    ], PURPLE),
]

for i, (cat, items, color) in enumerate(phase6_items):
    col = i % 2
    row = i // 2
    x = Inches(0.8) + Inches(col * 6.2)
    y = Inches(1.7) + Inches(row * 2.6)

    add_rounded_rect(slide, x, y, Inches(5.8), Inches(2.3), WHITE, color)
    add_rect(slide, x, y, Inches(1.3), Inches(0.4), color)
    add_text(slide, x + Inches(0.1), y + Inches(0.05), Inches(1.1), Inches(0.3),
             cat, font_size=13, color=WHITE, bold=True, alignment=PP_ALIGN.CENTER)

    for j, item in enumerate(items):
        add_text(slide, x + Inches(0.2), y + Inches(0.5 + j * 0.4), Inches(5.3), Inches(0.35),
                 f"• {item}", font_size=12, color=DARK_GRAY)


# ════════════════════════════════════════════
#  슬라이드 17: Q&A
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, NAVY)

add_rect(slide, Inches(0.8), Inches(2.2), Inches(1.5), Inches(0.06), BLUE)
add_text(slide, Inches(0.8), Inches(2.5), Inches(11), Inches(1.0),
         "Q & A", font_size=52, color=WHITE, bold=True)
add_text(slide, Inches(0.8), Inches(3.6), Inches(11), Inches(0.6),
         "질문 및 피드백을 환영합니다", font_size=22, color=RGBColor(0x94,0xA8,0xC8))

add_text(slide, Inches(0.8), Inches(5.2), Inches(11), Inches(0.4),
         "반도체 부품·소재 수요예측 AI SaaS", font_size=16, color=RGBColor(0x94,0xA8,0xC8))
add_text(slide, Inches(0.8), Inches(5.6), Inches(11), Inches(0.4),
         "경아 · 성민 · 지은 · 다솜", font_size=16, color=RGBColor(0x94,0xA8,0xC8))

add_rect(slide, Inches(0), H - Inches(0.06), W, Inches(0.06), BLUE)


# ════════════════════════════════════════════
#  저장
# ════════════════════════════════════════════
output_path = os.path.join(r"c:\AI\PJTFNL", "중간발표_반도체_수요예측_AI_SaaS.pptx")
prs.save(output_path)
print(f"Done: {output_path}")
print(f"Total slides: {len(prs.slides)}")
