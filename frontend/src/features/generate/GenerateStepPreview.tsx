import * as React from 'react'
import {
  Download,
  Printer,
  Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RichText } from '@/components/shared/rich-text'
import { apiClient } from '@/lib/api-client'
import { toBnDigits } from '@/lib/bn'
import type { RenderedPaper } from '@/lib/api/model/renderedPaper'

interface GenerateStepPreviewProps {
  setId: string
  onBackToPicker: () => void
  teacherName?: string
}

export function GenerateStepPreview({
  setId,
  onBackToPicker,
  teacherName = 'Md. Aburayhan',
}: GenerateStepPreviewProps) {
  const [paper, setPaper] = React.useState<RenderedPaper | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isDownloadingPdf, setIsDownloadingPdf] = React.useState(false)

  // Customization Panel States (Matching 4.png)
  const [showAnswerKey, setShowAnswerKey] = React.useState(false)
  const [showOmr, setShowOmr] = React.useState(false)
  const [columns, setColumns] = React.useState<1 | 2>(2)
  const [fontSizePt, setFontSizePt] = React.useState<number>(11)
  const [pageSize, setPageSize] = React.useState<'A4' | 'Letter' | 'Legal'>('A4')
  const [showColumnDivider, setShowColumnDivider] = React.useState(true)
  const [marginScale, setMarginScale] = React.useState<number>(3) // 1-5 scale

  // Header Toggles
  const [customInstituteName, setCustomInstituteName] = React.useState(teacherName)
  const [showInstituteName, setShowInstituteName] = React.useState(true)
  const [showLevelName, setShowLevelName] = React.useState(true)
  const [showSubjectName, setShowSubjectName] = React.useState(true)
  const [showChapterName, setShowChapterName] = React.useState(true)
  const [showExamDate, setShowExamDate] = React.useState(false)
  const [showExamTitle, setShowExamTitle] = React.useState(true)
  const [showInstructions, setShowInstructions] = React.useState(true)

  // Watermark
  const [hasWatermark, setHasWatermark] = React.useState(false)
  const [watermarkText, setWatermarkText] = React.useState('ই-প্রশ্নব্যাংক')

  // Fetch Paper
  const fetchPaper = React.useCallback(async () => {
    if (!setId) return
    setIsLoading(true)
    try {
      const res = await apiClient.get<RenderedPaper>(`/api/v1/question-sets/${setId}/paper?variant=0`)
      setPaper(res.data)
      if (res.data?.header?.institutionName) {
        setCustomInstituteName(res.data.header.institutionName)
      }
    } catch {
      toast.error('প্রশ্নপত্র লোড করতে সমস্যা হয়েছে')
    } finally {
      setIsLoading(false)
    }
  }, [setId])

  React.useEffect(() => {
    fetchPaper()
  }, [fetchPaper])

  // PDF Download
  const handleDownloadPdf = async () => {
    if (!setId) return
    setIsDownloadingPdf(true)
    try {
      const res = await apiClient.post<{ downloadUrl?: string }>(`/api/v1/question-sets/${setId}/pdf`, {
        variant: 0,
      })
      if (res.data?.downloadUrl) {
        window.open(res.data.downloadUrl, '_blank')
        toast.success('পিডিএফ ডাউনলোড শুরু হয়েছে')
      } else {
        toast.info('পিডিএফ তৈরি হচ্ছে, কয়েক সেকেন্ড পর আবার চেষ্টা করুন')
      }
    } catch {
      toast.error('পিডিএফ তৈরিতে সমস্যা হয়েছে')
    } finally {
      setIsDownloadingPdf(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  // Margin padding mapping
  const marginPaddingClass =
    marginScale === 1
      ? 'p-4 sm:p-6'
      : marginScale === 2
      ? 'p-6 sm:p-8'
      : marginScale === 4
      ? 'p-8 sm:p-12'
      : marginScale === 5
      ? 'p-10 sm:p-14'
      : 'p-6 sm:p-10'

  return (
    <div className="min-h-screen bg-slate-100/70 pb-16 font-sans">
      {/* Top Action Bar (Matching 4.png) */}
      <div className="bg-white border-b border-slate-200 py-2.5 px-4 sticky top-0 z-30 flex items-center justify-center print:hidden shadow-2xs">
        <Button
          type="button"
          onClick={onBackToPicker}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8 px-4 rounded-md shadow-xs gap-1.5"
        >
          <Plus className="size-3.5" />
          আরও প্রশ্ন যুক্ত করুন
        </Button>
      </div>

      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
          {/* Center Column: Printable A4 Paper Document (Matching 4.png) */}
          <div className="xl:col-span-3 flex justify-center print:block print:w-full">
            {isLoading ? (
              <div className="w-full max-w-[210mm] min-h-[600px] bg-white rounded shadow-md flex flex-col items-center justify-center gap-3">
                <span className="size-7 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-500 font-medium">প্রশ্নপত্র লোড হচ্ছে...</p>
              </div>
            ) : !paper ? (
              <div className="w-full max-w-[210mm] min-h-[400px] bg-white rounded shadow-md p-12 text-center space-y-3">
                <p className="text-sm font-semibold text-rose-600">প্রশ্নপত্র পাওয়া যায়নি</p>
                <Button size="sm" variant="outline" onClick={onBackToPicker}>
                  প্রশ্ন যোগ করতে ফিরে যান
                </Button>
              </div>
            ) : (
              <div
                id="printable-paper"
                className={`w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-900 shadow-xl border border-slate-200/80 font-serif relative print:shadow-none print:border-none print:m-0 print:w-full ${marginPaddingClass}`}
                style={{
                  fontSize: `${fontSizePt}pt`,
                  fontFamily: "'Noto Serif Bengali', serif",
                }}
              >
                {/* Optional Watermark */}
                {hasWatermark && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-0 opacity-10">
                    <span className="text-7xl font-bold -rotate-45 text-slate-800 tracking-wider">
                      {watermarkText}
                    </span>
                  </div>
                )}

                {/* Exam Paper Header */}
                <div className="relative z-10 text-center border-b-2 border-slate-900 pb-3 mb-4 space-y-1">
                  {showInstituteName && (
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                      {customInstituteName || teacherName}
                    </h1>
                  )}

                  {showExamTitle && (
                    <div className="py-0.5">
                      <h2 className="text-base sm:text-lg font-bold inline-block px-3 py-0.5">
                        {paper.header.title}
                      </h2>
                    </div>
                  )}

                  {/* Exam Meta Info */}
                  <div className="flex flex-wrap items-center justify-between text-xs font-semibold pt-1 border-t border-slate-800/30 text-slate-900">
                    <div>
                      {showLevelName && <span>শ্রেণি: {paper.header.levelName}</span>}
                      {showLevelName && showSubjectName && <span className="mx-2">·</span>}
                      {showSubjectName && <span>বিষয়: {paper.header.subjectName}</span>}
                      {showChapterName && (
                        <>
                          <span className="mx-2">·</span>
                          <span>অধ্যায়</span>
                        </>
                      )}
                    </div>

                    <div>
                      <span>সময়: {toBnDigits(paper.header.durationMin)} মিনিট</span>
                      <span className="mx-2">·</span>
                      <span>পূর্ণমান: {toBnDigits(paper.header.fullMarks)}</span>
                    </div>
                  </div>

                  {showInstructions && (
                    <p className="text-[11px] text-slate-600 italic pt-1">
                      প্রশ্নপত্রে কোনো প্রকার দাগ/চিহ্ন দেয়া যাবেনা।
                    </p>
                  )}
                </div>

                {/* 2-Column Questions Flow */}
                <div
                  className={`relative z-10 gap-6 text-justify ${
                    columns === 2 ? 'sm:columns-2 print:columns-2' : 'columns-1'
                  }`}
                  style={{
                    columnRule: showColumnDivider ? '1px solid #cbd5e1' : 'none',
                  }}
                >
                  {paper.blocks.map((block, bIdx) => (
                    <div key={bIdx} className="break-inside-avoid mb-4">
                      {/* Common stimulus info box */}
                      {block.kind === 1 && block.stimulus && (
                        <div className="border border-slate-300 bg-slate-50/60 p-2.5 mb-2 rounded text-xs italic leading-relaxed">
                          <span className="font-bold not-italic block mb-0.5">
                            নিচের তথ্যের আলোকে পরবর্তী প্রশ্নের উত্তর দাও:
                          </span>
                          <RichText content={block.stimulus} />
                        </div>
                      )}

                      {/* Question Item */}
                      {block.questions.map((q, qIdx) => (
                        <div key={q.questionId || qIdx} className="mb-3.5 leading-relaxed text-xs">
                          <div className="flex items-start gap-1">
                            <span className="font-bold mr-1 shrink-0">
                              {toBnDigits(q.number || qIdx + 1)}.
                            </span>
                            <div className="flex-1">
                              <RichText content={q.stem} />
                            </div>
                          </div>

                          {/* MCQ Options */}
                          {q.options && q.options.length > 0 && (
                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1.5 pl-4 text-[11px]">
                              {q.options.map((opt, oIdx) => {
                                const optLabel = ['(ক)', '(খ)', '(গ)', '(ঘ)'][oIdx] || `(${oIdx + 1})`
                                return (
                                  <div key={opt.originalIndex || oIdx} className="flex items-start gap-1">
                                    <span className="font-semibold">{optLabel}</span>
                                    <div className="flex-1">
                                      <RichText content={opt.content} />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                {/* Answer Key if enabled */}
                {showAnswerKey && paper.answerKey && (
                  <div className="relative z-10 mt-8 pt-4 border-t-2 border-slate-900 break-before-page">
                    <h3 className="font-bold text-sm mb-2 text-center">উত্তরমালা</h3>
                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 text-xs text-center">
                      {paper.answerKey.map((ans, aIdx) => {
                        const optBn = ['ক', 'খ', 'গ', 'ঘ'][ans.optionLabel] || String(ans.optionLabel)
                        return (
                          <div key={aIdx} className="border border-slate-300 p-1 rounded bg-slate-50">
                            <div className="font-semibold text-[10px] text-slate-500">
                              {toBnDigits(ans.number || aIdx + 1)}
                            </div>
                            <div className="font-bold text-slate-900">{optBn}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Customization Sidebar (Matching 4.png) */}
          <div className="xl:col-span-1 space-y-4 print:hidden sticky top-14">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              {/* Header Buttons: Download & Print */}
              <div className="p-3 bg-slate-50 border-b border-slate-100 flex gap-2">
                <Button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isDownloadingPdf}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-9 gap-1.5 shadow-xs"
                >
                  <Download className="size-3.5" />
                  {isDownloadingPdf ? 'তৈরি হচ্ছে...' : 'ডাউনলোড'}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePrint}
                  className="px-3 border-slate-200 text-slate-700 text-xs h-9 gap-1"
                >
                  <Printer className="size-3.5" />
                  প্রিন্ট
                </Button>
              </div>

              {/* Settings Accordions / Sections */}
              <div className="p-4 space-y-5 text-xs text-slate-700 max-h-[75vh] overflow-y-auto pr-2">
                {/* 1. প্রশ্ন অন্তর্ভুক্তি */}
                <div className="space-y-2.5 pb-3 border-b border-slate-100">
                  <div className="font-bold text-slate-900 text-xs">প্রশ্ন অন্তর্ভুক্তি</div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sw-answer" className="text-xs font-medium cursor-pointer">
                      উত্তরপত্র
                    </Label>
                    <Switch
                      id="sw-answer"
                      checked={showAnswerKey}
                      onCheckedChange={setShowAnswerKey}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sw-omr" className="text-xs font-medium cursor-pointer">
                      OMR অন্তর্ভুক্ত
                    </Label>
                    <Switch id="sw-omr" checked={showOmr} onCheckedChange={setShowOmr} />
                  </div>
                </div>

                {/* 2. হেডার সেটিংস */}
                <div className="space-y-2.5 pb-3 border-b border-slate-100">
                  <div className="font-bold text-slate-900 text-xs">হেডার সেটিংস (হেডার)</div>

                  {/* Institute Name */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="sw-inst" className="text-[11px] font-medium cursor-pointer">
                        প্রতিষ্ঠানের নাম
                      </Label>
                      <Switch
                        id="sw-inst"
                        checked={showInstituteName}
                        onCheckedChange={setShowInstituteName}
                      />
                    </div>
                    {showInstituteName && (
                      <Input
                        value={customInstituteName}
                        onChange={(e) => setCustomInstituteName(e.target.value)}
                        className="h-7 text-xs border-slate-200"
                        placeholder="প্রতিষ্ঠানের নাম..."
                      />
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium">শ্রেণির নাম</span>
                    <Switch checked={showLevelName} onCheckedChange={setShowLevelName} />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium">বিষয়ের নাম</span>
                    <Switch checked={showSubjectName} onCheckedChange={setShowSubjectName} />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium">অধ্যায়ের নাম</span>
                    <Switch checked={showChapterName} onCheckedChange={setShowChapterName} />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium">তারিখ</span>
                    <Switch checked={showExamDate} onCheckedChange={setShowExamDate} />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium">পরীক্ষার নাম</span>
                    <Switch checked={showExamTitle} onCheckedChange={setShowExamTitle} />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium">নির্দেশনা</span>
                    <Switch checked={showInstructions} onCheckedChange={setShowInstructions} />
                  </div>
                </div>

                {/* 3. ডকুমেন্ট কাস্টমাইজেশন */}
                <div className="space-y-3 pb-3 border-b border-slate-100">
                  <div className="font-bold text-slate-900 text-xs">ডকুমেন্ট কাস্টমাইজেশন</div>

                  {/* Columns */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium block">কলাম সংখ্যা</span>
                    <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-md">
                      <button
                        type="button"
                        onClick={() => setColumns(1)}
                        className={`py-1 rounded text-xs font-semibold ${
                          columns === 1 ? 'bg-white shadow-xs text-slate-900' : 'text-slate-600'
                        }`}
                      >
                        ১ কলাম
                      </button>
                      <button
                        type="button"
                        onClick={() => setColumns(2)}
                        className={`py-1 rounded text-xs font-semibold ${
                          columns === 2 ? 'bg-white shadow-xs text-slate-900' : 'text-slate-600'
                        }`}
                      >
                        ২ কলাম
                      </button>
                    </div>
                  </div>

                  {/* Page Setup */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium block">Page Setup</span>
                    <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-md text-[11px]">
                      {(['A4', 'Letter', 'Legal'] as const).map((ps) => (
                        <button
                          key={ps}
                          type="button"
                          onClick={() => setPageSize(ps)}
                          className={`py-1 rounded font-semibold ${
                            pageSize === ps ? 'bg-white shadow-xs text-slate-900' : 'text-slate-600'
                          }`}
                        >
                          {ps}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Size */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-medium">ফন্ট সাইজ</span>
                      <span className="font-bold">{toBnDigits(fontSizePt)}pt</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 w-6 p-0 text-xs"
                        onClick={() => setFontSizePt((prev) => Math.max(9, prev - 1))}
                      >
                        -
                      </Button>
                      <div className="flex-1 text-center font-bold text-xs bg-slate-50 py-0.5 rounded border border-slate-200">
                        {fontSizePt}pt
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 w-6 p-0 text-xs"
                        onClick={() => setFontSizePt((prev) => Math.min(14, prev + 1))}
                      >
                        +
                      </Button>
                    </div>
                  </div>

                  {/* Column Divider */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium">কলাম দাগ</span>
                    <Switch
                      checked={showColumnDivider}
                      onCheckedChange={setShowColumnDivider}
                    />
                  </div>

                  {/* Margin Scale */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-medium">মার্জিন</span>
                      <span className="text-slate-500">লেভেল {toBnDigits(marginScale)}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={marginScale}
                      onChange={(e) => setMarginScale(Number(e.target.value))}
                      className="w-full accent-emerald-600 cursor-pointer"
                    />
                  </div>
                </div>

                {/* 4. জলছাপ (Watermark) */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">জলছাপ</span>
                    <Switch checked={hasWatermark} onCheckedChange={setHasWatermark} />
                  </div>
                  {hasWatermark && (
                    <Input
                      value={watermarkText}
                      onChange={(e) => setWatermarkText(e.target.value)}
                      placeholder="জলছাপ লেখা..."
                      className="h-7 text-xs border-slate-200"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
