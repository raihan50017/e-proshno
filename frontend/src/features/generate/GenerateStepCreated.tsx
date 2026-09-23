import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toBnDigits } from '@/lib/bn'

interface GenerateStepCreatedProps {
  teacherName?: string
  levelName?: string
  subjectName?: string
  chapterName?: string
  durationMin?: number
  fullMarks?: number
  onAddQuestions: () => void
}

export function GenerateStepCreated({
  teacherName = 'Md. Aburayhan',
  levelName = 'এইচএসসি',
  subjectName = 'পদার্থবিজ্ঞান ২য় পত্র',
  chapterName = 'অধ্যায় ১ - তাপগতিবিদ্যা',
  durationMin = 30,
  fullMarks = 30,
  onAddQuestions,
}: GenerateStepCreatedProps) {
  return (
    <div className="min-h-[85vh] bg-[#daf5ea] py-10 px-4 flex items-center justify-center font-sans">
      {/* Centered A4 Paper Sheet (Matching 2.png) */}
      <div className="w-full max-w-2xl bg-white shadow-xl rounded-sm p-8 sm:p-14 min-h-[460px] flex flex-col justify-between border border-slate-200/90 text-slate-900">
        {/* Exam Paper Header */}
        <div className="space-y-1 text-center">
          <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            {teacherName}
          </h1>
          <p className="text-xs text-slate-700 font-medium">{levelName}</p>
          <p className="text-xs text-slate-700 font-medium">{subjectName}</p>
          <p className="text-xs text-slate-600">{chapterName}</p>

          {/* Time & Marks Meta Row */}
          <div className="flex items-center justify-between text-xs font-semibold text-slate-800 pt-3 px-1">
            <span>সময়: {toBnDigits(durationMin)} মিনিট</span>
            <span>পূর্ণমান: {toBnDigits(fullMarks)}</span>
          </div>

          {/* Divider Line */}
          <div className="border-b border-slate-300 pt-1 pb-1" />

          {/* Exam Instruction */}
          <p className="text-[11px] text-slate-600 italic text-center pt-1">
            প্রশ্নপত্রে কোনো প্রকার দাগ/চিহ্ন দেয়া যাবেনা।
          </p>
        </div>

        {/* Paper Content Area: Created Empty State */}
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center space-y-3">
          <div className="flex items-center gap-1.5 text-emerald-600">
            <CheckCircle2 className="size-5" />
            <span className="font-bold text-sm text-emerald-700">প্রশ্নসেট তৈরী হয়েছে!</span>
          </div>
          <p className="text-xs text-slate-500 max-w-xs">
            নিচের বাটনে ক্লিক করে ডেটাবেজ থেকে প্রশ্ন যুক্ত করুন
          </p>

          <div className="pt-2">
            <Button
              type="button"
              onClick={onAddQuestions}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-6 h-9 rounded-md shadow-xs transition-all"
            >
              প্রশ্ন যুক্ত করুন
            </Button>
          </div>
        </div>

        {/* Paper Footer Spacing */}
        <div className="pt-4" />
      </div>
    </div>
  )
}
