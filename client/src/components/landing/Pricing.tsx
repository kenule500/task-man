import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';

const Pricing = () => {
  const plans = [
    {
      name: 'Free',
      tagline: 'Perfect for solo work',
      price: '$0',
      period: '/month',
      features: [
        '1 workspace',
        'Up to 3 members',
        'Unlimited personal tasks',
        'Basic workspace settings',
        'Email support',
      ],
      cta: 'Get Started',
      ctaLink: '/signup',
      highlighted: false,
    },
    {
      name: 'Pro',
      tagline: 'For growing teams',
      price: '$12',
      period: '/member/month',
      features: [
        'Unlimited workspaces',
        'Up to 25 members per workspace',
        'Advanced analytics & reports',
        'Custom workspace roles',
        'Shared invite links',
        'Priority support',
      ],
      cta: 'Start Free Trial',
      ctaLink: '/signup',
      highlighted: true,
    },
    {
      name: 'Enterprise',
      tagline: 'For large organizations',
      price: 'Custom',
      period: '',
      features: [
        'Unlimited everything',
        'SSO & SAML',
        'Audit logs & compliance',
        'Dedicated account manager',
        '99.9% uptime SLA',
        'Custom integrations & API',
      ],
      cta: 'Contact Sales',
      ctaLink: 'mailto:sales@taskman.io',
      highlighted: false,
    },
  ];

  return (
    <section id="pricing" className="py-24 bg-white border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-block py-1 px-3 rounded-full bg-blue-50 text-primary font-semibold tracking-wide text-xs mb-6 border border-blue-100">
            PRICING
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Start for free. Upgrade when your team grows. No hidden fees, no surprises.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={
                plan.highlighted
                  ? 'bg-gradient-to-br from-primary to-blue-600 p-8 rounded-2xl shadow-2xl shadow-primary/30 relative flex flex-col md:-translate-y-2'
                  : 'bg-white p-8 rounded-2xl border border-gray-200 flex flex-col'
              }
            >
              {plan.highlighted && (
                <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-full">
                  POPULAR
                </div>
              )}

              <div className="mb-6">
                <h3 className={`text-xl font-bold mb-2 ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>
                  {plan.name}
                </h3>
                <p className={`text-sm ${plan.highlighted ? 'text-white/80' : 'text-gray-500'}`}>
                  {plan.tagline}
                </p>
              </div>

              <div className="mb-6">
                <span className={`text-4xl font-bold ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>
                  {plan.price}
                </span>
                {plan.period && (
                  <span className={`text-sm ${plan.highlighted ? 'text-white/70' : 'text-gray-500'}`}>
                    {plan.period}
                  </span>
                )}
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, j) => (
                  <li
                    key={j}
                    className={`flex items-start gap-2 text-sm ${plan.highlighted ? 'text-white' : 'text-gray-600'}`}
                  >
                    <Check
                      className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                        plan.highlighted ? 'text-white' : 'text-primary'
                      }`}
                    />
                    {feature}
                  </li>
                ))}
              </ul>

              {plan.highlighted ? (
                <Link
                  to={plan.ctaLink}
                  className="block text-center w-full bg-white hover:bg-slate-50 text-primary py-3 rounded-xl font-semibold transition-colors shadow-lg"
                >
                  {plan.cta}
                </Link>
              ) : plan.ctaLink.startsWith('mailto:') ? (
                <a
                  href={plan.ctaLink}
                  className="block text-center w-full bg-gray-100 hover:bg-gray-200 text-gray-900 py-3 rounded-xl font-semibold transition-colors"
                >
                  {plan.cta}
                </a>
              ) : (
                <Link
                  to={plan.ctaLink}
                  className="block text-center w-full bg-gray-100 hover:bg-gray-200 text-gray-900 py-3 rounded-xl font-semibold transition-colors"
                >
                  {plan.cta}
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* FAQ / Note */}
        <p className="text-center text-sm text-gray-400 mt-12">
          All plans include unlimited task creation, secure authentication, and email support.
        </p>
      </div>
    </section>
  );
};

export default Pricing;