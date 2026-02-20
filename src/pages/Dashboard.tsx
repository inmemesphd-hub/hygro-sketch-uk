import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import {
  Thermometer,
  Droplets,
  Sun,
  Building2,
  Home,
  Waves,
  GitBranch,
  Eye,
  Wind,
  FileBarChart2,
  LogOut,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const modules = [
  {
    id: 'u-value',
    title: 'U-Value Calculations',
    description: 'Thermal transmittance per BS EN ISO 6946 with parallel path bridging',
    icon: Thermometer,
    route: '/u-value',
    active: true,
    gradient: 'from-blue-500/20 to-cyan-500/20',
    border: 'border-blue-500/30 hover:border-blue-400/60',
    iconColor: 'text-blue-400',
    glow: 'hover:shadow-blue-500/20',
  },
  {
    id: 'cra',
    title: 'Condensation Risk Analysis',
    description: 'Interstitial & surface condensation per BS EN ISO 13788 Glaser Method',
    icon: Droplets,
    route: '/cra',
    active: true,
    gradient: 'from-cyan-500/20 to-teal-500/20',
    border: 'border-cyan-500/30 hover:border-cyan-400/60',
    iconColor: 'text-cyan-400',
    glow: 'hover:shadow-cyan-500/20',
  },
  {
    id: 'overheating',
    title: 'Overheating Analysis',
    description: 'Simplified & TM59 dynamic overheating assessment',
    icon: Sun,
    route: '/overheating',
    active: false,
    gradient: 'from-orange-500/20 to-amber-500/20',
    border: 'border-orange-500/20 hover:border-orange-400/40',
    iconColor: 'text-orange-400',
    glow: 'hover:shadow-orange-500/20',
  },
  {
    id: 'sbem',
    title: 'SBEM',
    description: 'Simplified Building Energy Model for non-domestic buildings',
    icon: Building2,
    route: '/sbem',
    active: false,
    gradient: 'from-violet-500/20 to-purple-500/20',
    border: 'border-violet-500/20 hover:border-violet-400/40',
    iconColor: 'text-violet-400',
    glow: 'hover:shadow-violet-500/20',
  },
  {
    id: 'sap',
    title: 'SAP Calculations',
    description: 'Standard Assessment Procedure for domestic dwellings',
    icon: Home,
    route: '/sap',
    active: false,
    gradient: 'from-green-500/20 to-emerald-500/20',
    border: 'border-green-500/20 hover:border-green-400/40',
    iconColor: 'text-green-400',
    glow: 'hover:shadow-green-500/20',
  },
  {
    id: 'water',
    title: 'Water Calculations',
    description: 'Water usage, drainage and flow rate calculations',
    icon: Waves,
    route: '/water',
    active: false,
    gradient: 'from-sky-500/20 to-blue-500/20',
    border: 'border-sky-500/20 hover:border-sky-400/40',
    iconColor: 'text-sky-400',
    glow: 'hover:shadow-sky-500/20',
  },
  {
    id: 'thermal-bridging',
    title: 'Thermal Bridging',
    description: 'Linear thermal transmittance (ψ-values) per ISO 10211',
    icon: GitBranch,
    route: '/thermal-bridging',
    active: false,
    gradient: 'from-rose-500/20 to-pink-500/20',
    border: 'border-rose-500/20 hover:border-rose-400/40',
    iconColor: 'text-rose-400',
    glow: 'hover:shadow-rose-500/20',
  },
  {
    id: 'daylighting',
    title: 'Daylighting',
    description: 'Daylight factor, ADF and compliance with BB 103 & CIBSE LG10',
    icon: Eye,
    route: '/daylighting',
    active: false,
    gradient: 'from-yellow-500/20 to-lime-500/20',
    border: 'border-yellow-500/20 hover:border-yellow-400/40',
    iconColor: 'text-yellow-400',
    glow: 'hover:shadow-yellow-500/20',
  },
  {
    id: 'thermal-modelling',
    title: 'Thermal Modelling',
    description: 'TM52, TM54, dynamic simulation & thermal comfort analysis',
    icon: Wind,
    route: '/thermal-modelling',
    active: false,
    gradient: 'from-indigo-500/20 to-blue-500/20',
    border: 'border-indigo-500/20 hover:border-indigo-400/40',
    iconColor: 'text-indigo-400',
    glow: 'hover:shadow-indigo-500/20',
  },
  {
    id: 'energy-statements',
    title: 'Energy Statements',
    description: 'Part L compliance, energy strategy and EPC reporting',
    icon: FileBarChart2,
    route: '/energy-statements',
    active: false,
    gradient: 'from-teal-500/20 to-green-500/20',
    border: 'border-teal-500/20 hover:border-teal-400/40',
    iconColor: 'text-teal-400',
    glow: 'hover:shadow-teal-500/20',
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07, delayChildren: 0.2 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 200, damping: 20 } },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const leftColumn = modules.filter((_, i) => i % 2 === 0);
  const rightColumn = modules.filter((_, i) => i % 2 === 1);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold gradient-text">Thermal Suite</h1>
            <p className="text-xs text-muted-foreground">Building Physics & Energy Calculations</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="hidden sm:block truncate max-w-[160px]">{user?.email}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-10">
        {/* Intro */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl font-bold text-foreground mb-3">
            Select a <span className="gradient-text">Calculation Module</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm">
            Choose from the suite of engineering tools below. Active modules are ready to use; additional tools are coming soon.
          </p>
        </motion.div>

        {/* Two-column grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl mx-auto"
        >
          {/* Interleave left & right columns to maintain top-to-bottom reading */}
          {modules.map((mod, i) => {
            const Icon = mod.icon;
            return (
              <motion.button
                key={mod.id}
                variants={cardVariants}
                onClick={() => mod.active ? navigate(mod.route) : undefined}
                disabled={!mod.active}
                className={cn(
                  'relative group text-left w-full rounded-2xl border p-6 transition-all duration-300',
                  'bg-gradient-to-br backdrop-blur-sm',
                  mod.gradient,
                  mod.border,
                  'hover:shadow-lg',
                  mod.glow,
                  mod.active
                    ? 'cursor-pointer'
                    : 'cursor-not-allowed opacity-60'
                )}
              >
                {/* Coming soon badge */}
                {!mod.active && (
                  <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground border border-border">
                    Coming Soon
                  </span>
                )}

                <div className="flex items-start gap-4">
                  {/* Icon bubble */}
                  <div className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
                    'bg-background/60 border border-border',
                    'group-hover:scale-110 transition-transform duration-300',
                    !mod.active && 'grayscale'
                  )}>
                    <Icon className={cn('w-6 h-6', mod.active ? mod.iconColor : 'text-muted-foreground')} />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <h3 className={cn(
                      'font-semibold text-base mb-1',
                      mod.active ? 'text-foreground' : 'text-muted-foreground'
                    )}>
                      {mod.title}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {mod.description}
                    </p>
                  </div>
                </div>

                {/* Active arrow indicator */}
                {mod.active && (
                  <div className={cn(
                    'absolute bottom-4 right-5 opacity-0 group-hover:opacity-100 transition-opacity duration-300',
                    mod.iconColor
                  )}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                )}
              </motion.button>
            );
          })}
        </motion.div>
      </main>
    </div>
  );
}
