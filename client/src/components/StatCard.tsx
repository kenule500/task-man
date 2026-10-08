import { ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: ReactNode;
  colorClass?: string;
}

const StatCard = ({ title, value, subtitle, icon, colorClass = 'text-primary' }: StatCardProps) => {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <div className={`w-5 h-5 ${colorClass}`}>{icon}</div>
          <p className="text-sm font-semibold text-slate-700">{title}</p>
        </div>
        <button className="text-slate-400 hover:text-slate-600">
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

      <div>
        <h3 className="text-3xl font-bold text-slate-900 tracking-tight mb-1">{value}</h3>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
};

export default StatCard;