import type { RenderedPaper } from '@/lib/api/model/renderedPaper'
import type { PaperBlock } from '@/lib/api/model/paperBlock'
import type { PaperQuestion } from '@/lib/api/model/paperQuestion'
import { OPTION_LABELS, toBnDigits } from '@/lib/bn'
import { RichText } from '@/components/shared/rich-text'
import { cn } from '@/lib/utils'

export interface PaperDocumentProps {
  paper: RenderedPaper
  columns?: 1 | 2
  fontSizePt?: number
  showAnswers?: boolean
  showBoardTags?: boolean
  className?: string
}

export function PaperDocument({
  paper,
  columns = 2,
  fontSizePt = 11,
  showAnswers = false,
  showBoardTags = false,
  className,
}: PaperDocumentProps) {
  const { header, blocks, answerKey, variantLabel } = paper

  return (
    <div
      id="printable-paper"
      className={cn(
        'w-full max-w-[210mm] min-h-[297mm] mx-auto bg-white text-black p-6 sm:p-10 font-serif leading-relaxed shadow-sm print:shadow-none print:p-0 print:m-0 print:max-w-none print:w-full',
        className
      )}
      style={{
        fontSize: `${fontSizePt}pt`,
        fontFamily: "'Noto Serif Bengali', serif",
      }}
    >
      {/* Institutional Header */}
      <div className="text-center border-b-2 border-black pb-3 mb-4 space-y-1">
        {header.institutionName && (
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-black">
            {header.institutionName}
          </h1>
        )}
        {header.institutionAddress && (
          <p className="text-xs text-black/80">{header.institutionAddress}</p>
        )}

        <div className="py-0.5">
          <h2 className="text-base sm:text-lg font-bold inline-block px-3 py-0.5 border-b border-black/40">
            {header.title}
          </h2>
        </div>

        {/* Exam Meta Info */}
        <div className="flex flex-wrap items-center justify-between text-xs font-semibold pt-1 border-t border-black/20 text-black/90">
          <div>
            <span>শ্রেণি: {header.levelName}</span>
            <span className="mx-2">·</span>
            <span>বিষয়: {header.subjectName}</span>
          </div>

          {variantLabel && (
            <div className="border border-black px-2 py-0.5 rounded font-bold">
              সেট কোড: {variantLabel}
            </div>
          )}

          <div>
            <span>সময়: {toBnDigits(header.durationMin)} মিনিট</span>
            <span className="mx-2">·</span>
            <span>পূর্ণমান: {toBnDigits(header.fullMarks)}</span>
          </div>
        </div>

        {paper.settings?.header?.instructions && (
          <p className="text-[11px] text-black/70 italic pt-0.5">
            [ দ্রষ্টব্য: {paper.settings.header.instructions} ]
          </p>
        )}
      </div>

      {/* Questions Flow in Columns */}
      <div
        className={cn(
          'gap-6 text-justify print:text-black',
          columns === 2 ? 'sm:columns-2 print:columns-2' : 'columns-1'
        )}
      >
        {blocks.map((block: PaperBlock, bIdx: number) => (
          <div key={bIdx} className="break-inside-avoid mb-4">
            {/* Common stimulus info box */}
            {block.kind === 1 /* CommonInfo */ && block.stimulus && (
              <div className="border border-black/30 bg-black/[0.02] p-2.5 mb-2.5 rounded text-xs italic leading-relaxed">
                <span className="font-bold not-italic block mb-0.5">
                  নিচের তথ্যের আলোকে পরবর্তী প্রশ্নের উত্তর দাও:
                </span>
                <RichText content={block.stimulus} />
              </div>
            )}

            {/* Questions inside block */}
            <div className="space-y-3.5">
              {block.questions.map((q: PaperQuestion) => (
                <div key={q.questionId} className="break-inside-avoid space-y-1.5">
                  {/* Stem */}
                  <div className="flex items-start gap-1.5 leading-snug">
                    <span className="font-bold shrink-0">
                      {toBnDigits(q.number)}.
                    </span>
                    <div className="flex-1 font-medium text-black">
                      <RichText content={q.stem} />
                      {showBoardTags && q.boardTags && q.boardTags.length > 0 && (
                        <span className="text-[10px] text-black/60 font-sans ml-1.5">
                          [{q.boardTags.join('; ')}]
                        </span>
                      )}
                    </div>
                  </div>

                  {/* MCQ Options */}
                  {q.type === 0 /* MCQ */ && q.options && q.options.length > 0 && (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs pl-4 pt-0.5">
                      {q.options.map((opt, oIdx) => {
                        const label = OPTION_LABELS[opt.label ?? oIdx] || String.fromCharCode(65 + oIdx)
                        const isCorrect = opt.isCorrect && showAnswers
                        return (
                          <div
                            key={oIdx}
                            className={cn(
                              'flex items-baseline gap-1.5',
                              isCorrect && 'font-bold text-emerald-800 underline'
                            )}
                          >
                            <span className="shrink-0 font-bold">({label})</span>
                            <div className="flex-1">
                              <RichText content={opt.content} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* CQ Parts */}
                  {q.type === 1 /* CQ */ && q.cqParts && q.cqParts.length > 0 && (
                    <div className="space-y-1 pl-4 pt-0.5 text-xs">
                      {q.cqParts.map((part, pIdx) => {
                        const label = OPTION_LABELS[part.part ?? pIdx] || String.fromCharCode(65 + pIdx)
                        return (
                          <div
                            key={pIdx}
                            className="flex items-baseline justify-between gap-2"
                          >
                            <div className="flex items-baseline gap-1.5 flex-1">
                              <span className="font-bold shrink-0">({label})</span>
                              <div className="flex-1">
                                <RichText content={part.prompt} />
                              </div>
                            </div>
                            <span className="shrink-0 font-semibold text-black/80 font-sans text-[11px]">
                              [{toBnDigits(part.marks)}]
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Optional Answer Sheet / উত্তরমালা */}
      {showAnswers && answerKey && answerKey.length > 0 && (
        <div className="mt-8 pt-4 border-t-2 border-black/60 break-before-page">
          <h3 className="text-sm font-bold text-center border-b border-black/40 pb-1 mb-3">
            উত্তরমালা (সেট: {variantLabel})
          </h3>
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 text-xs text-center font-sans">
            {answerKey.map((item) => (
              <div
                key={item.number}
                className="border border-black/30 p-1 rounded bg-black/[0.02]"
              >
                <div className="text-[10px] text-black/60">{toBnDigits(item.number)}</div>
                <div className="font-bold text-sm text-black">
                  {OPTION_LABELS[item.optionLabel] || '-'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
