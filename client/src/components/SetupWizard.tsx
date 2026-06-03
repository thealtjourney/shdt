import React, { useState } from 'react';
import {
  CheckCircle,
  ArrowRight,
  Upload,
  Database,
  Users,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from './ui/Button';
import DataUploadModal from './DataUploadModal';

interface SetupWizardProps {
  onClose: () => void;
}

const SetupWizard: React.FC<SetupWizardProps> = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<boolean[]>([
    false,
    false,
    false,
    false,
  ]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [activeDataType, setActiveDataType] = useState<
    'properties' | 'maintenance' | 'enrichment' | 'tenants'
  >('properties');
  const [showCelebration, setShowCelebration] = useState(false);

  const steps = [
    {
      title: 'Upload Property Data',
      subtitle: 'Step 1 - Required',
      description:
        'Import your property portfolio data. This is the foundation of your digital twin.',
      icon: Database,
      status: 'required',
      dataType: 'properties' as const,
    },
    {
      title: 'Add Maintenance History',
      subtitle: 'Step 2 - Recommended',
      description:
        'Import historical maintenance records to track component lifecycle and predict failures.',
      icon: Upload,
      status: 'recommended',
      dataType: 'maintenance' as const,
    },
    {
      title: 'Run Open Data Enrichment',
      subtitle: 'Step 3 - Automatic',
      description:
        'Automatically enrich your data with public datasets like flood risk and energy ratings.',
      icon: Sparkles,
      status: 'automatic',
      dataType: 'enrichment' as const,
    },
    {
      title: 'Import Tenant Data',
      subtitle: 'Step 4 - Optional',
      description:
        'Add tenant information to enable occupancy-aware analytics and predictive maintenance.',
      icon: Users,
      status: 'optional',
      dataType: 'tenants' as const,
    },
  ];

  const handleStartStep = (stepIndex: number, dataType: typeof activeDataType) => {
    setCurrentStep(stepIndex);
    setActiveDataType(dataType);
    if (stepIndex === 2) {
      // Enrichment is automatic, mark as complete
      const newCompleted = [...completedSteps];
      newCompleted[2] = true;
      setCompletedSteps(newCompleted);
      setCurrentStep(3);
    } else {
      setShowUploadModal(true);
    }
  };

  const handleUploadComplete = () => {
    const newCompleted = [...completedSteps];
    newCompleted[currentStep] = true;
    setCompletedSteps(newCompleted);
    setShowUploadModal(false);

    // Move to next step
    if (currentStep < steps.length - 1) {
      if (currentStep === 2) {
        setCurrentStep(3);
      } else {
        setCurrentStep(currentStep + 1);
      }
    } else {
      setShowCelebration(true);
    }
  };

  const handleSkipStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setShowCelebration(true);
    }
  };

  if (showCelebration) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-12 text-center max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mb-6">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-blue-200 rounded-full blur-xl animate-pulse" />
              <div className="relative bg-gradient-to-br from-blue-400 to-blue-600 rounded-full p-6">
                <CheckCircle className="w-16 h-16 text-white" />
              </div>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-slate-900 mb-3">
            Your digital twin is ready
          </h1>
          <p className="text-slate-600 mb-2">
            Congratulations! You've successfully set up your Unified Data Hub.
          </p>
          <p className="text-sm text-slate-500 mb-8">
            Your property data is now ready for analysis and AI-powered insights.
          </p>

          <div className="bg-slate-50 rounded-lg p-4 mb-6 text-left">
            <h3 className="font-semibold text-slate-900 mb-3">What's next?</h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Explore your digital twin in the Dashboard</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Set up predictive maintenance alerts</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Configure energy and performance goals</span>
              </li>
            </ul>
          </div>

          <Button
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-700 text-lg py-3"
          >
            Start Exploring
          </Button>
        </div>
      </div>
    );
  }

  const step = steps[currentStep];
  const StepIcon = step.icon;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-8 py-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <h1 className="text-3xl font-bold mb-2">Set up your data hub</h1>
          <p className="text-blue-100">
            Follow these 4 steps to build your digital twin
          </p>

          {/* Progress Indicator */}
          <div className="mt-6 flex gap-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`flex-1 h-1 rounded-full transition-all ${
                  completedSteps[index]
                    ? 'bg-blue-300'
                    : index <= currentStep
                      ? 'bg-white'
                      : 'bg-blue-400'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-8">
            {/* Steps List */}
            <div className="space-y-4 mb-8">
              {steps.map((s, index) => (
                <div
                  key={index}
                  className={`rounded-lg border-2 transition-all ${
                    index === currentStep
                      ? 'border-blue-500 bg-blue-50'
                      : completedSteps[index]
                        ? 'border-green-200 bg-green-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                  } p-4 cursor-pointer`}
                  onClick={() => {
                    if (index < currentStep || completedSteps[index]) {
                      setCurrentStep(index);
                    }
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`p-3 rounded-lg flex-shrink-0 ${
                        index === currentStep
                          ? 'bg-blue-100'
                          : completedSteps[index]
                            ? 'bg-green-100'
                            : 'bg-slate-100'
                      }`}
                    >
                      {completedSteps[index] ? (
                        <CheckCircle
                          className={`w-6 h-6 ${
                            completedSteps[index]
                              ? 'text-green-600'
                              : 'text-slate-400'
                          }`}
                        />
                      ) : (
                        <s.icon
                          className={`w-6 h-6 ${
                            index === currentStep
                              ? 'text-blue-600'
                              : 'text-slate-400'
                          }`}
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-900">
                          {s.title}
                        </h3>
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${
                            s.status === 'required'
                              ? 'bg-red-100 text-red-700'
                              : s.status === 'recommended'
                                ? 'bg-amber-100 text-amber-700'
                                : s.status === 'automatic'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {s.subtitle}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">{s.description}</p>

                      {completedSteps[index] && (
                        <p className="text-sm text-green-700 font-medium mt-2">
                          ✓ Complete
                        </p>
                      )}
                    </div>

                    {index === currentStep && !completedSteps[index] && (
                      <ArrowRight className="w-5 h-5 text-blue-500 flex-shrink-0 mt-1" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Current Step Details */}
            {currentStep < steps.length && (
              <div className="bg-slate-50 rounded-lg p-6 mb-6">
                <h3 className="font-semibold text-slate-900 mb-3">
                  Step {currentStep + 1}: {step.title}
                </h3>
                <p className="text-slate-600 text-sm mb-4">{step.description}</p>

                {currentStep === 2 && (
                  <div className="bg-white border border-green-200 rounded-lg p-4 text-sm text-green-800">
                    <p className="font-medium mb-1">Automatic processing</p>
                    <p>
                      Your data will be automatically enriched with public data sources.
                      This step will run in the background.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-8 py-4 flex gap-3 justify-between">
          <Button
            variant="outline"
            onClick={() => {
              if (currentStep > 0) {
                setCurrentStep(currentStep - 1);
              } else {
                onClose();
              }
            }}
          >
            {currentStep === 0 ? 'Cancel' : 'Back'}
          </Button>

          <div className="flex gap-3">
            {(step.status === 'recommended' || step.status === 'optional') && (
              <Button variant="outline" onClick={handleSkipStep}>
                Skip
              </Button>
            )}
            <Button
              onClick={() => handleStartStep(currentStep, step.dataType)}
              className={`gap-2 ${
                step.status === 'required'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {step.status === 'automatic' ? (
                <>
                  <Sparkles className="w-4 h-4" />
                  Start Enrichment
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload Data
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <DataUploadModal
          dataType={activeDataType}
          onClose={() => {
            setShowUploadModal(false);
            handleUploadComplete();
          }}
        />
      )}
    </div>
  );
};

export default SetupWizard;
