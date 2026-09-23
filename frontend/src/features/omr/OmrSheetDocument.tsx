import * as React from 'react'
import { toBnDigits } from '@/lib/bn'
import { cn } from '@/lib/utils'

export interface OmrSheetDocumentProps {
  institutionName?: string
  examTitle: string
  subjectName?: string
  questionCount: number // 20, 25, 30, 50, 100
  rollDigits?: number // 5 or 6
  setVariant?: string // 'ক' | 'খ' | 'গ' | 'ঘ' | 'all'
  instructions?: string
  className?: string
}

const BUBBLE_LABELS = ['ক', 'খ', 'গ', 'ঘ']
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

export function OmrSheetDocument({
  institutionName = 'ই-প্রশ্ন জাতীয় একাডেমি',
  examTitle = 'মডেল টেস্ট পরীক্ষা ২০২৬',
  subjectName = 'পদার্থবিজ্ঞান',
  questionCount = 30,
  rollDigits = 6,
  setVariant = 'ক',
  instructions,
  className,
}: OmrSheetDocumentProps) {
  // Determine grid columns based on count:
  // 20-30 questions -> 2 columns
  // 50 questions -> 2 columns (25 + 25)
  // 100 questions -> 4 columns (25 x 4)
  const columnsCount = questionCount > 50 ? 4 : 2
  const questionsPerCol = Math.ceil(questionCount / columnsCount)

  const columns = React.useMemo(() => {
    const cols: number[][] = []
    for (let c = 0; c < columnsCount; c++) {
      const start = c * questionsPerCol + 1
      const end = Math.min(questionCount, (c + 1) * questionsPerCol)
      const list: number[] = []
      for (let i = start; i <= end; i++) {
        list.push(i)
      }
      cols.push(list)
    }
    return cols
  }, [questionCount, columnsCount, questionsPerCol])

  return (
    <div
      id="printable-omr-sheet"
      className={cn(
        'relative w-full max-w-[210mm] min-h-[297mm] mx-auto bg-white text-black p-6 sm:p-8 font-sans border border-black/30 shadow-md print:shadow-none print:border-none print:m-0 print:p-6 print:max-w-none print:w-full select-none',
        className
      )}
      style={{
        fontFamily: "'Hind Siliguri', sans-serif",
      }}
    >
      {/* ── Optical Registration Corner Markers (Standard OMR L-marks) ── */}
      <div className="absolute top-4 left-4 size-5 border-t-4 border-l-4 border-black" />
      <div className="absolute top-4 right-4 size-5 border-t-4 border-r-4 border-black" />
      <div className="absolute bottom-4 left-4 size-5 border-b-4 border-l-4 border-black" />
      <div className="absolute bottom-4 right-4 size-5 border-b-4 border-r-4 border-black" />

      {/* ── Top Header Bar ── */}
      <div className="text-center pb-2 border-b-2 border-black space-y-0.5">
        <div className="inline-block px-3 py-0.5 border border-black text-[10px] font-bold uppercase tracking-wider mb-1">
          অপটিক্যাল মার্ক রিডার (OMR) উত্তরপত্র
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-black leading-tight">
          {institutionName}
        </h1>
        <h2 className="text-sm sm:text-base font-semibold text-black/90">
          {examTitle}
        </h2>
        <div className="flex items-center justify-center gap-4 text-xs font-semibold text-black/80 pt-0.5">
          {subjectName && <span>বিষয়: {subjectName}</span>}
          <span>·</span>
          <span>সর্বমোট প্রশ্ন: {toBnDigits(questionCount)} টি</span>
          <span>·</span>
          <span>প্রতিটি প্রশ্নের মান: ১.০০</span>
        </div>
      </div>

      {/* ── Candidate & Exam ID Section (Roll & Set Bubbles) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 py-3 border-b-2 border-black text-xs">
        {/* Left: Instructions */}
        <div className="sm:col-span-4 border border-black p-2.5 rounded space-y-1.5 bg-black/[0.02]">
          <span className="font-bold text-[11px] block border-b border-black/40 pb-0.5">
            শিক্ষার্থীদের জন্য জরুরি নির্দেশনাবলী:
          </span>
          <ul className="text-[10px] leading-tight space-y-1 text-black/90 list-disc pl-3">
            <li>অবশ্যই কালো বলপয়েন্ট কলম ব্যবহার করতে হবে।</li>
            <li>বৃত্তটি সম্পূর্ণ কালো করে ভরাট করুন। টিক (✓) বা ক্রস (✗) দেওয়া যাবে না।</li>
            <li>
              সঠিক পদ্ধতি:{' '}
              <span className="inline-block size-3.5 rounded-full bg-black align-middle mx-1" />
              ভুল:{' '}
              <span className="inline-block size-3.5 rounded-full border border-black text-center align-middle text-[8px] leading-3 font-bold mx-0.5">
                ✓
              </span>
            </li>
            <li>ওএমআর শীটটি কোনো অবস্থাতেই ভাঁজ বা দাগানো যাবে না।</li>
            <li>প্রতিটি প্রশ্নের জন্য কেবল একটি বৃত্তই ভরাট করা যাবে।</li>
          </ul>
          {instructions && (
            <p className="text-[9px] italic text-black/80 pt-1 border-t border-black/20">
              বিশেষ দ্রষ্টব্য: {instructions}
            </p>
          )}
        </div>

        {/* Center: Roll Number Grid */}
        <div className="sm:col-span-5 border border-black p-2 rounded flex flex-col items-center">
          <span className="font-bold text-[11px] mb-1">রোল নম্বর / নিবন্ধন (ROLL NO)</span>

          {/* Roll digit input boxes */}
          <div className="flex gap-1.5 mb-1.5">
            {Array.from({ length: rollDigits }).map((_, rIdx) => (
              <div
                key={rIdx}
                className="size-6 border-2 border-black rounded text-center text-xs font-bold leading-5 bg-white"
              />
            ))}
          </div>

          {/* Roll number bubble matrix (0 - 9) */}
          <div className="flex gap-1.5">
            {Array.from({ length: rollDigits }).map((_, colIdx) => (
              <div key={colIdx} className="flex flex-col gap-0.5 items-center">
                {DIGITS.map((d) => (
                  <div
                    key={d}
                    className="size-4 rounded-full border border-black flex items-center justify-center text-[9px] font-bold leading-none"
                  >
                    {toBnDigits(d)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Set Code Box */}
        <div className="sm:col-span-3 border border-black p-2 rounded flex flex-col items-center justify-between">
          <div className="w-full text-center">
            <span className="font-bold text-[11px] block border-b border-black/30 pb-0.5 mb-1.5">
              প্রশ্নসেট কোড (SET)
            </span>
            <div className="flex justify-center gap-2 py-1">
              {BUBBLE_LABELS.map((label) => {
                const isPreselected = setVariant === label
                return (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <div
                      className={cn(
                        'size-5 rounded-full border-2 border-black flex items-center justify-center text-xs font-bold leading-none',
                        isPreselected && 'bg-black text-white'
                      )}
                    >
                      {label}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Signature Box */}
          <div className="w-full pt-2 border-t border-black/20 text-center">
            <div className="h-6 border-b border-dashed border-black/60 mb-0.5" />
            <span className="text-[9px] text-black/80 font-medium">
              পরীক্ষার্থীর পূর্ণ স্বাক্ষর
            </span>
          </div>
        </div>
      </div>

      {/* ── Main OMR Answer Bubbles Grid ── */}
      <div className="pt-4 pb-3">
        <div
          className={cn(
            'grid gap-x-6 gap-y-1',
            columnsCount === 4 ? 'grid-cols-4' : 'grid-cols-2'
          )}
        >
          {columns.map((col, colIdx) => (
            <div
              key={colIdx}
              className={cn(
                'space-y-1',
                colIdx < columnsCount - 1 && 'border-r border-black/20 pr-3'
              )}
            >
              {col.map((qNum) => (
                <div
                  key={qNum}
                  className="flex items-center justify-between text-xs py-0.5 px-1 rounded hover:bg-black/[0.02]"
                >
                  {/* Question Number */}
                  <span className="font-bold w-6 text-right font-mono text-[11px] text-black">
                    {toBnDigits(qNum)}.
                  </span>

                  {/* Bubbles ক, খ, গ, ঘ */}
                  <div className="flex items-center gap-1.5">
                    {BUBBLE_LABELS.map((b) => (
                      <div
                        key={b}
                        className="size-4 sm:size-4.5 rounded-full border-2 border-black flex items-center justify-center text-[9px] sm:text-[10px] font-bold leading-none bg-white hover:bg-black hover:text-white transition-colors cursor-pointer"
                      >
                        {b}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom Invigilator Signature & Barcode Bar ── */}
      <div className="pt-3 border-t-2 border-black flex items-end justify-between text-xs">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 text-[10px] text-black/70">
            <span className="font-mono">BARCODE:</span>
            <span className="font-mono font-bold tracking-widest">
              *EP-OMR-{toBnDigits(questionCount)}-{setVariant}*
            </span>
          </div>
          <p className="text-[9px] text-black/60">
            e-proshno Smart OMR Engine · কপিরাইট সংরক্ষিত
          </p>
        </div>

        <div className="w-48 text-center">
          <div className="h-8 border-b border-dashed border-black/80 mb-0.5" />
          <span className="text-[10px] font-bold text-black">
            কক্ষ পরিদর্শকের স্বাক্ষর ও তারিখ
          </span>
        </div>
      </div>
    </div>
  )
}
