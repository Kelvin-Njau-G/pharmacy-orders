import logo from '../assets/afyanzima-icon.png'

export default function FacilityPicker({ facilities, profile, onSelect }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={logo} alt="AfyaNzima" className="h-12 w-auto mx-auto mb-4" />
          <h1 className="text-xl font-extrabold text-gray-900">Which branch today?</h1>
          <p className="text-sm text-gray-500 mt-1">
            Welcome, <strong>{profile?.full_name}</strong>. Select the facility you're working at.
          </p>
        </div>
        <div className="space-y-3">
          {facilities.map(fac => (
            <button key={fac.id} onClick={() => onSelect(fac)}
              className="w-full text-left px-5 py-4 bg-white border border-gray-200 rounded-xl
                hover:border-brand hover:bg-blue-50 transition-colors group shadow-sm">
              <p className="font-bold text-gray-800 group-hover:text-brand text-sm">{fac.name}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
