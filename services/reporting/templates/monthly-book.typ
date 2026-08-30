#let source = sys.inputs.at("data")
#let book = json(source)

#set document(title: book.title, author: book.family)
#set page(
  paper: "a5",
  margin: (top: 18mm, bottom: 18mm, left: 17mm, right: 15mm),
  header: context {
    if counter(page).get().first() > 2 {
      set text(font: "Segoe UI", size: 7.5pt, fill: rgb("667085"))
      grid(columns: (1fr, auto), book.title, book.month)
      line(length: 100%, stroke: 0.4pt + rgb("d0d5dd"))
    }
  },
  footer: context {
    if counter(page).get().first() > 1 {
      set text(font: "Segoe UI", size: 8pt, fill: rgb("667085"))
      align(center, counter(page).display("1"))
    }
  },
)
#set text(font: "Libertinus Serif", size: 10.5pt, lang: "vi", fill: rgb("1d2939"))
#set par(justify: true, leading: 0.72em)
#set heading(numbering: "1.1", outlined: true)
#show heading.where(level: 1): it => {
  set text(font: "Segoe UI", size: 17pt, weight: "semibold", fill: rgb("175cd3"))
  block(above: 4pt, below: 10pt, breakable: false)[#it]
}
#show heading.where(level: 2): it => {
  set text(font: "Segoe UI", size: 12pt, weight: "semibold", fill: rgb("344054"))
  block(above: 12pt, below: 6pt, breakable: false)[#it]
}

#let paragraph-list(items) = {
  for item in items {
    par()[#item]
    v(5pt)
  }
}
#let metric-card(metric) = box(
  width: 100%,
  inset: 8pt,
  radius: 5pt,
  fill: rgb("f2f4f7"),
  stroke: 0.5pt + rgb("d0d5dd"),
)[
  #text(font: "Segoe UI", size: 8pt, fill: rgb("667085"))[#metric.label]
  #v(2pt)
  #text(font: "Segoe UI", size: 13pt, weight: "bold", fill: rgb("101828"))[#metric.value]
  #v(2pt)
  #text(size: 7.5pt, fill: rgb("667085"))[#metric.note]
]

#let render-table(data) = {
  let header-cells = data.headers.map(item => table.cell(
    fill: rgb("eaf2ff"),
    align: left,
    text(font: "Segoe UI", size: 8pt, weight: "semibold")[#item],
  ))
  let body-cells = data.rows.flatten().map(item => table.cell(
    align: left,
    text(size: 8pt)[#item],
  ))
  table(
    columns: data.headers.len(),
    inset: (x: 7pt, y: 5pt),
    stroke: 0.45pt + rgb("d0d5dd"),
    table.header(..header-cells),
    ..body-cells,
  )
}

// Cover
#align(center + horizon)[
  #text(font: "Segoe UI", size: 9pt, weight: "semibold", fill: rgb("1570ef"))[NHẬT KÝ GIA ĐÌNH]
  #v(13mm)
  #text(font: "Libertinus Serif", size: 28pt, weight: "bold", fill: rgb("101828"))[#book.title]
  #v(6mm)
  #line(length: 32mm, stroke: 1.2pt + rgb("53b1fd"))
  #v(6mm)
  #text(font: "Segoe UI", size: 13pt, fill: rgb("344054"))[#book.month]
  #v(16mm)
  #box(width: 90%, inset: 12pt, radius: 7pt, fill: rgb("f5faff"))[
    #text(size: 11pt, style: "italic", fill: rgb("344054"))[#book.intro]
  ]
  #v(18mm)
  #text(font: "Segoe UI", size: 9pt, fill: rgb("667085"))[#book.family]
]

#pagebreak()
#outline(title: [Mục lục], indent: auto)

#for (index, section) in book.sections.enumerate() {
  pagebreak()
  heading(level: 1, section.title)
  paragraph-list(section.paragraphs)

  if "metrics" in section {
    v(5pt)
    grid(
      columns: (1fr, 1fr),
      gutter: 7pt,
      ..section.metrics.map(metric-card),
    )
    v(10pt)
  }

  if "table" in section {
    render-table(section.table)
    v(10pt)
  }

  if "subsections" in section {
    for subsection in section.subsections {
      heading(level: 2, subsection.title)
      paragraph-list(subsection.paragraphs)
    }
  }
}
