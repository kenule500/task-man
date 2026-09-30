const TrustedBy = () => {
  const companies = ['Acme Corp', 'GlobalTech', 'Nexus', 'Innovate', 'Pulse'];

  return (
    <section className="py-16 border-y border-gray-100 bg-white mt-20">
      <div className="max-w-7xl mx-auto px-6 text-center">
        <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-8">Trusted by teams at</p>
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-50 grayscale">
          {companies.map((company) => (
            <span key={company} className="text-xl font-bold text-gray-400">{company}</span>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustedBy;