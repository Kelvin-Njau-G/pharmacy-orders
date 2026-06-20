const STYLES = {
  Draft:     'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  Submitted: 'bg-blue-50  text-blue-700  ring-1 ring-blue-200',
  Processed: 'bg-green-50 text-green-700 ring-1 ring-green-200',
}

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STYLES[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}
