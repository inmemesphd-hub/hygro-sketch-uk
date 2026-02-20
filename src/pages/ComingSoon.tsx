import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, HardHat } from 'lucide-react';
import { motion } from 'framer-motion';

interface ComingSoonProps {
  title: string;
  description: string;
}

export default function ComingSoon({ title, description }: ComingSoonProps) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center max-w-md"
      >
        <div className="w-20 h-20 rounded-2xl bg-muted/40 border border-border flex items-center justify-center mx-auto mb-6">
          <HardHat className="w-10 h-10 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold mb-3">{title}</h1>
        <p className="text-muted-foreground text-sm mb-8">{description}</p>
        <p className="text-xs text-muted-foreground bg-muted/30 border border-border rounded-lg px-4 py-3 mb-6">
          This module is under development. Check back soon.
        </p>
        <Button variant="outline" onClick={() => navigate('/')} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Button>
      </motion.div>
    </div>
  );
}
