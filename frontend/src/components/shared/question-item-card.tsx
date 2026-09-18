import { CheckCircle2, Copy, Edit3, Flag, PlusCircle, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { QuestionCard } from '@/lib/api/model/questionCard'
import { OPTION_LABELS, toBnDigits } from '@/lib/bn'
import { cn } from '@/lib/utils'
import { RichText } from './rich-text'

export interface QuestionItemCardProps {
  question: QuestionCard
  index?: number
  isSelected?: boolean
  onToggleSelect?: (question: QuestionCard) => void
  onCopy?: (question: QuestionCard) => void
  onReport?: (question: QuestionCard) => void
  onEdit?: (question: QuestionCard) => void
  onAddToSet?: (question: QuestionCard) => void
  showActions?: boolean
  className?: string
}

export function QuestionItemCard({
  question,
  index,
  isSelected = false,
  onToggleSelect,
  onCopy,
  onReport,
  onEdit,
  onAddToSet,
  showActions = true,
  className,
}: QuestionItemCardProps) {
  return (
    <Card
      className={cn(
        'overflow-hidden border transition-all',
        isSelected
          ? 'border-primary ring-2 ring-primary/20 bg-primary/[0.02]'
          : 'border-border hover:border-border/80',
        className
      )}
    >
      <CardContent className="p-4 sm:p-5 space-y-3">
        {/* Top Meta Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {index !== undefined && (
              <span className="flex size-6 items-center justify-center rounded bg-muted font-bold text-foreground">
                {toBnDigits(index + 1)}
              </span>
            )}
            <Badge variant="outline" className="text-[11px]">
              {question.type === 0 ? 'MCQ' : 'সৃজনশীল'}
            </Badge>

            {question.chapterName && (
              <Badge variant="secondary" className="text-[11px] font-normal">
                অধ্যায় {toBnDigits(question.chapterNumber)}: {question.chapterName}
              </Badge>
            )}

            {question.boardTags && question.boardTags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Right importance stars & actions */}
          <div className="flex items-center gap-2">
            {question.importance > 0 && (
              <div className="flex items-center text-amber-500">
                {Array.from({ length: Math.min(question.importance, 3) }).map((_, i) => (
                  <Star key={i} className="size-3 fill-amber-500" />
                ))}
              </div>
            )}

            {showActions && onToggleSelect && (
              <Button
                type="button"
                size="sm"
                variant={isSelected ? 'default' : 'outline'}
                className="h-7 text-xs px-2.5"
                onClick={() => onToggleSelect(question)}
              >
                {isSelected ? 'নির্বাচিত' : '+ নির্বাচন'}
              </Button>
            )}
          </div>
        </div>

        {/* Stimulus (উদ্দীপক) if present */}
        {question.stimulus && (
          <div className="rounded-md border border-border/80 bg-muted/30 p-3 text-sm leading-relaxed text-foreground/90">
            <span className="font-semibold text-primary block mb-1">উদ্দীপক:</span>
            <RichText content={question.stimulus} />
          </div>
        )}

        {/* Question Stem */}
        <div className="text-sm font-medium text-foreground leading-relaxed">
          <RichText content={question.stem} />
        </div>

        {/* Options for MCQ */}
        {question.type === 0 && question.options && question.options.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 pt-1">
            {question.options.map((opt, optIdx) => {
              const label = OPTION_LABELS[optIdx] || String.fromCharCode(65 + optIdx)
              return (
                <div
                  key={optIdx}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-3 py-2 text-xs leading-relaxed transition-colors',
                    opt.isCorrect
                      ? 'border-emerald-300 bg-emerald-50/70 text-emerald-950 font-medium dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                      : 'border-border/70 bg-card text-foreground'
                  )}
                >
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full font-bold text-[11px]',
                      opt.isCorrect
                        ? 'bg-emerald-600 text-white'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {label}
                  </span>
                  <div className="flex-1">
                    <RichText content={opt.content} />
                  </div>
                  {opt.isCorrect && (
                    <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Parts for CQ */}
        {question.type === 1 && question.cqParts && question.cqParts.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {question.cqParts.map((part, pIdx) => (
              <div
                key={pIdx}
                className="flex items-baseline justify-between gap-2 text-xs py-1 border-b border-border/40 last:border-b-0"
              >
                <div className="flex gap-2">
                  <span className="font-bold text-primary">({OPTION_LABELS[pIdx] || pIdx + 1})</span>
                  <div>
                    <RichText content={part.prompt} />
                  </div>
                </div>
                <span className="shrink-0 text-muted-foreground font-medium">
                  [{toBnDigits(part.marks)}]
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Card Footer actions */}
        {showActions && (
          <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs text-muted-foreground">
            <div>
              {question.bankName && (
                <span className="text-[11px] text-muted-foreground font-medium">
                  ব্যাংক: {question.bankName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {onAddToSet && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2.5 gap-1.5 border-primary/40 text-primary hover:bg-primary/10 font-semibold"
                  onClick={() => onAddToSet(question)}
                >
                  <PlusCircle className="size-3.5" />
                  সেটে যোগ
                </Button>
              )}
              {onEdit && (question.canEdit || question.bankId) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2 gap-1 text-primary hover:bg-primary/10"
                  onClick={() => onEdit(question)}
                >
                  <Edit3 className="size-3" />
                  সম্পাদনা
                </Button>
              )}
              {onCopy && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2 gap-1"
                  onClick={() => onCopy(question)}
                >
                  <Copy className="size-3" />
                  কপি
                </Button>
              )}
              {onReport && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-destructive"
                  onClick={() => onReport(question)}
                >
                  <Flag className="size-3" />
                  রিপোর্ট
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
