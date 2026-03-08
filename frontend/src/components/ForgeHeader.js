// Shared top header bar for all authenticated pages
// Usage: <ForgeHeader title="Settings" />

export default function ForgeHeader({ title, subtitle }) {
    return (
        <div className="bg-white border-b border-gray-100 px-6 pt-12 pb-4 sticky top-0 z-10">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 font-chivo">{title}</h1>
                    {subtitle && (
                        <p className="text-xs text-gray-400 font-manrope mt-0.5">{subtitle}</p>
                    )}
                </div>
                {/* FORGE brand mark — top right */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className="w-7 h-7 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-sm shadow-orange-200">
                        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 3c1.1 0 2 .9 2 2v.5c0 .3.2.5.5.5s.5-.2.5-.5V7c0-.6.4-1 1-1s1 .4 1 1v1c0 3.3-2.7 6-6 6H9.5C8.1 14 7 12.9 7 11.5S8.1 9 9.5 9H11c.6 0 1-.4 1-1V7c0-.6.4-1 1-1z" />
                        </svg>
                    </div>
                    <span className="text-sm font-black text-gray-900 font-chivo tracking-tight">FORGE</span>
                </div>
            </div>
        </div>
    );
}
