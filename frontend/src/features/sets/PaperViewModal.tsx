import * as React from 'react'
import {
  Columns2,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Printer,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { RenderedPaper } from '@/lib/api/model/renderedPaper'
import { useGetSetPaper } from '@/lib/api/generated/question-sets/question-sets'
import { apiClient } from '@/lib/api-client'
import { PaperDocument } from './PaperDocument'

interface PaperViewModalProps {
  setId: string | null
  isOpen: boolean
  onClose: () => void
}

const VARIANT_NAMES = ['ক', 'খ', 'গ', 'ঘ']

export function PaperViewModal({ setId, isOpen, onClose }: PaperViewModalProps) {
  const [variant, setVariant] = React.useState<number>(0)
  const [columns, setColumns] = React.useState<1 | 2>(2)
  const [fontSizePt, setFontSizePt] = React.useState<number>(11)
  const [showAnswers, setShowAnswers] = React.useState<boolean>(false)
  const [isDownloadingPdf, setIsDownloadingPdf] = React.useState<boolean>(false)

  const { data, isLoading, isError } = useGetSetPaper(
    setId || '',
    { variant },
    {
      query: {
        enabled: Boolean(isOpen && setId),
        staleTime: 1000 * 60 * 2,
      },
    }
  )

  const paper: RenderedPaper | null =
    data && 'status' in data && data.status === 200
      ? (data.data as RenderedPaper)
      : null

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPdf = async () => {
    if (!setId) return
    setIsDownloadingPdf(true)
    try {
      const res = await apiClient.post(`/api/v1/question-sets/${setId}/pdf`, {
        variant,
      })

      if (res.data?.downloadUrl) {
        window.open(res.data.downloadUrl, '_blank')
        toast.success('পিডিএফ ডাউনলোড শুরু হয়েছে')
      } else {
        toast.info('পিডিএফ তৈরি হচ্ছে, অনুগ্রহ করে কয়েক সেকেন্ড পর আবার চেষ্টা করুন')
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'পিডিএফ তৈরিতে সমস্যা হয়েছে'
      toast.error(msg)
    } finally {
      setIsDownloadingPdf(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 overflow-hidden bg-muted/20">
        {/* Modal Top Bar (Controls) - Hidden on Print */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-background border-b border-border print:hidden">
          <DialogHeader className="p-0 space-y-0.5 text-left">
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Printer className="size-4 text-primary" />
              প্রশ্নপত্র ভিউ ও মুদ্রণ
            </DialogTitle>
            <DialogDescription className="text-xs">
              সেট ভ্যারিয়েন্ট ও লেআউট নির্ধারণ করে সরাসরি A4 সাইজে প্রিন্ট বা পিডিএফ সংরক্ষণ করুন
            </DialogDescription>
          </DialogHeader>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleDownloadPdf}
              loading={isDownloadingPdf}
              loadingText="তৈরি হচ্ছে..."
            >
              <Download className="size-3.5" />
              পিডিএফ
            </Button>

            <Button
              type="button"
              size="sm"
              className="h-8 text-xs gap-1.5 shadow-sm"
              onClick={handlePrint}
            >
              <Printer className="size-3.5" />
              প্রিন্ট করুন
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Toolbar: Variants & Layout Controls - Hidden on Print */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-background/80 border-b border-border/80 text-xs print:hidden">
          {/* Variant Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground font-medium">সেট:</span>
            {VARIANT_NAMES.map((label, idx) => (
              <Button
                key={label}
                type="button"
                variant={variant === idx ? 'default' : 'outline'}
                size="sm"
                className="size-7 p-0 text-xs font-bold"
                onClick={() => setVariant(idx)}
              >
                {label}
              </Button>
            ))}
          </div>

          {/* Layout Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Columns Toggle */}
            <div className="flex items-center gap-1 border rounded-md p-0.5 bg-muted/40">
              <button
                type="button"
                onClick={() => setColumns(1)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  columns === 1 ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                }`}
              >
                ১ কলাম
              </button>
              <button
                type="button"
                onClick={() => setColumns(2)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  columns === 2 ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                }`}
              >
                <Columns2 className="size-3" />
                ২ কলাম (A4)
              </button>
            </div>

            {/* Font Size Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs">ফন্ট:</span>
              <div className="w-28">
                <Combobox
                  options={[
                    { value: '10', label: '১০pt (ছোট)' },
                    { value: '11', label: '১১pt (স্বাভাবিক)' },
                    { value: '12', label: '১২pt (বড়)' },
                  ]}
                  value={String(fontSizePt)}
                  onChange={(val) => setFontSizePt(Number(val))}
                  triggerClassName="h-7 text-xs px-2"
                />
              </div>
            </div>

            {/* Answers Toggle */}
            <Button
              type="button"
              variant={showAnswers ? 'secondary' : 'outline'}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setShowAnswers(!showAnswers)}
            >
              {showAnswers ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
              {showAnswers ? 'উত্তরমালা লুকান' : 'উত্তরমালা দেখুন'}
            </Button>
          </div>
        </div>

        {/* Paper Document Preview Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-muted/30 print:p-0 print:bg-white print:overflow-visible">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm font-medium">প্রশ্নপত্র প্রস্তুত করা হচ্ছে...</p>
            </div>
          ) : isError || !paper ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-2 text-center text-muted-foreground">
              <p className="text-sm font-semibold text-destructive">
                প্রশ্নপত্র লোড করা যায়নি
              </p>
              <p className="text-xs">
                সম্ভবত এই প্রশ্নসেটে এখনও কোনো প্রশ্ন যোগ করা হয়নি।
              </p>
            </div>
          ) : (
            <PaperDocument
              paper={paper}
              columns={columns}
              fontSizePt={fontSizePt}
              showAnswers={showAnswers}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
