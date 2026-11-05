import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { CheckCircle2, AlertCircle, Loader2, ChevronRight, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const FunctionDisplay = ({ toolCall }) => {
  const [expanded, setExpanded] = useState(false);
  const name = toolCall?.name || 'Function';
  const status = toolCall?.status || 'pending';
  const results = toolCall?.results;

  const parsedResults = (() => {
    if (!results) return null;
    try { return typeof results === 'string' ? JSON.parse(results) : results; }
    catch { return results; }
  })();

  const isError = results && (
    (typeof results === 'string' && /error|failed/i.test(results)) ||
    (parsedResults?.success === false)
  );

  const statusConfig = {
    pending: { icon: Clock, color: 'text-slate-400', text: 'Pending' },
    running: { icon: Loader2, color: 'text-slate-500', text: 'Running...', spin: true },
    in_progress: { icon: Loader2, color: 'text-slate-500', text: 'Running...', spin: true },
    completed: isError ? { icon: AlertCircle, color: 'text-red-500', text: 'Failed' } : { icon: CheckCircle2, color: 'text-green-600', text: 'Done' },
    success: { icon: CheckCircle2, color: 'text-green-600', text: 'Done' },
    failed: { icon: AlertCircle, color: 'text-red-500', text: 'Failed' },
    error: { icon: AlertCircle, color: 'text-red-500', text: 'Failed' },
  }[status] || { icon: Zap, color: 'text-slate-500', text: '' };

  const Icon = statusConfig.icon;
  const formattedName = name.replace(/_/g, ' ').replace(/\./g, ' › ');

  return (
    <div className="mt-2 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all hover:bg-muted/50', expanded ? 'bg-muted/50 border-border' : 'bg-card border-border')}
      >
        <Icon className={cn('h-3 w-3', statusConfig.color, statusConfig.spin && 'animate-spin')} />
        <span className="text-muted-foreground capitalize">{formattedName}</span>
        {statusConfig.text && <span className="text-muted-foreground/60">• {statusConfig.text}</span>}
        {!statusConfig.spin && (toolCall.arguments_string || results) && (
          <ChevronRight className={cn('h-3 w-3 text-muted-foreground/50 transition-transform ml-auto', expanded && 'rotate-90')} />
        )}
      </button>
      {expanded && !statusConfig.spin && (
        <div className="mt-1.5 ml-3 pl-3 border-l-2 border-border space-y-2">
          {toolCall.arguments_string && (
            <div>
              <div className="text-muted-foreground mb-1">Parameters:</div>
              <pre className="bg-muted rounded-md p-2 text-xs text-foreground/80 whitespace-pre-wrap">
                {(() => { try { return JSON.stringify(JSON.parse(toolCall.arguments_string), null, 2); } catch { return toolCall.arguments_string; } })()}
              </pre>
            </div>
          )}
          {parsedResults && (
            <div>
              <div className="text-muted-foreground mb-1">Result:</div>
              <pre className="bg-muted rounded-md p-2 text-xs text-foreground/80 whitespace-pre-wrap max-h-48 overflow-auto">
                {typeof parsedResults === 'object' ? JSON.stringify(parsedResults, null, 2) : parsedResults}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
          <span className="text-sm">🤖</span>
        </div>
      )}
      <div className={cn('max-w-[85%]', isUser && 'flex flex-col items-end')}>
        {message.content && (
          <div className={cn('rounded-2xl px-4 py-2.5', isUser ? 'bg-primary text-primary-foreground' : 'bg-card border border-border')}>
            {isUser ? (
              <p className="text-sm leading-relaxed">{message.content}</p>
            ) : (
              <ReactMarkdown
                className="text-sm prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-code:text-foreground prose-li:text-foreground"
                components={{
                  table: ({ children }) => <div className="overflow-x-auto my-2"><table className="text-xs border-collapse w-full">{children}</table></div>,
                  th: ({ children }) => <th className="border border-border px-2 py-1 bg-muted font-semibold text-left text-xs">{children}</th>,
                  td: ({ children }) => <td className="border border-border px-2 py-1 text-xs">{children}</td>,
                  code: ({ inline, children }) => inline
                    ? <code className="px-1 py-0.5 rounded bg-muted text-xs">{children}</code>
                    : <pre className="bg-muted rounded-lg p-3 overflow-x-auto my-2"><code className="text-xs">{children}</code></pre>,
                  p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="my-1 ml-4 list-disc">{children}</ul>,
                  ol: ({ children }) => <ol className="my-1 ml-4 list-decimal">{children}</ol>,
                  li: ({ children }) => <li className="my-0.5">{children}</li>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
          </div>
        )}
        {message.tool_calls?.length > 0 && (
          <div className="space-y-1 w-full">
            {message.tool_calls.map((tc, i) => <FunctionDisplay key={i} toolCall={tc} />)}
          </div>
        )}
      </div>
    </div>
  );
}