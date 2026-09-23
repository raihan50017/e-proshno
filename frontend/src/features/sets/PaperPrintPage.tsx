import * as React from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Columns2,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  Loader2,
  MonitorPlay,
  Printer,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import type { RenderedPaper } from '@/lib/api/model/renderedPaper'
import { useGetSetPaper } from '@/lib/api/generated/question-sets/question-sets'
import { apiClient } from '@/lib/api-client'
import { PaperDocument } from './PaperDocument'

const VARIANT_NAMES = ['ক', 'খ', 'গ', 'ঘ']

export function PaperPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [variant, setVariant] = React.useState<number>(0)
  const [columns, setColumns] = React.useState<1 | 2>(2)
  const [fontSizePt, setFontSizePt] = React.useState<number>(11)
  const [showAnswers, setShowAnswers] = React.useState<boolean>(false)
  const [isDownloadingPdf, setIsDownloadingPdf] = React.useState<boolean>(false)

  const { data, isLoading, isError } = useGetSetPaper(
    id || '',
    { variant },
    {
      query: {
        enabled: Boolean(id),
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
    if (!id) return
    setIsDownloadingPdf(true)
    try {
      const res = await apiClient.post(`/api/v1/question-sets/${id}/pdf`, {
        variant,
      })

      if (res.data?.downloadUrl) {
        window.open(res.data.downloadUrl, '_blank')
        toast.success('পিডিএফ ডাউনলোড শুরু হয়েছে')
      } else {
        toast.info('পিডিএফ তৈরি হচ্ছে, কয়েক সেকেন্ড পর আবার চেষ্টা করুন')
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'পিডিএফ তৈরিতে সমস্যা হয়েছে'
      toast.error(msg)
    } finally {
      setIsDownloadingPdf(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col font-sans">
      {/* Sticky Action Toolbar - Hidden on Print */}
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-8 py-3 bg-background border-b border-border shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <Link to="/sets">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
              <ArrowLeft className="size-4" />
              প্রশ্নসেট তালিকা
            </Button>
          </Link>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <h1 className="text-sm font-semibold text-foreground truncate max-w-xs">
            {paper?.header?.title || 'প্রশ্নপত্র প্রিভিউ'}
          </h1>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Variant Selector */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground font-medium mr-1">সেট:</span>
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

          {/* Columns Toggle */}
          <div className="flex items-center gap-1 border rounded-md p-0.5 bg-muted/40 text-xs">
            <button
              type="button"
              onClick={() => setColumns(1)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                columns === 1 ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground'
              }`}
            >
              ১ কলাম
            </button>
            <button
              type="button"
              onClick={() => setColumns(2)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                columns === 2 ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground'
              }`}
            >
              <Columns2 className="size-3" />
              ২ কলাম
            </button>
          </div>

          {/* Font Size Selector */}
          <div className="w-24">
            <Combobox
              options={[
                { value: '10', label: '১০pt' },
                { value: '11', label: '১১pt' },
                { value: '12', label: '১২pt' },
              ]}
              value={String(fontSizePt)}
              onChange={(val) => setFontSizePt(Number(val))}
              triggerClassName="h-8 text-xs px-2"
            />
          </div>

          {/* Answers Toggle */}
          <Button
            type="button"
            variant={showAnswers ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => setShowAnswers(!showAnswers)}
          >
            {showAnswers ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {showAnswers ? 'উত্তরমালা লুকান' : 'উত্তরমালা'}
          </Button>

          {/* Smartboard Presenter */}
          {id && (
            <Link to={`/smartboard?setId=${id}`}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
                title="ক্লাসরুমে প্রজেক্টর বা ডিজিটাল বোর্ডে উপস্থাপন করুন"
              >
                <MonitorPlay className="size-3.5" />
                স্মার্টবোর্ড
              </Button>
            </Link>
          )}

          {/* OMR Sheet Generator */}
          {id && (
            <Link to={`/omr?setId=${id}`}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-purple-500/30 text-purple-700 dark:text-purple-400 hover:bg-purple-500/10"
                title="এই প্রশ্নসেটের জন্য ওএমআর (OMR) শীট তৈরি করুন"
              >
                <FileCheck2 className="size-3.5" />
                ওএমআর শীট
              </Button>
            </Link>
          )}

          {/* Download PDF */}
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

          {/* Print */}
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs gap-1.5 shadow-sm"
            onClick={handlePrint}
          >
            <Printer className="size-3.5" />
            প্রিন্ট
          </Button>
        </div>
      </header>

      {/* Main Printable Content Area */}
      <main className="flex-1 p-4 sm:p-8 flex justify-center print:p-0 print:m-0 print:block">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-muted-foreground">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm font-medium">প্রশ্নপত্র লোড হচ্ছে...</p>
          </div>
        ) : isError || !paper ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] gap-2 text-center text-muted-foreground">
            <p className="text-base font-semibold text-destructive">
              প্রশ্নপত্র খুঁজে পাওয়া যায়নি বা কোনো প্রশ্ন যোগ করা হয়নি
            </p>
            <Link to="/sets">
              <Button variant="outline" size="sm" className="mt-3">
                প্রশ্নসেট তালিকায় ফিরে যান
              </Button>
            </Link>
          </div>
        ) : (
          <div className="w-full max-w-[210mm] shadow-lg print:shadow-none bg-white">
            <PaperDocument
              paper={paper}
              columns={columns}
              fontSizePt={fontSizePt}
              showAnswers={showAnswers}
            />
          </div>
        )}
      </main>
    </div>
  )
}
