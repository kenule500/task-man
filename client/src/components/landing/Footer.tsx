const Footer = () => {
  return (
    <footer className="bg-white border-t border-gray-100 py-12">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-primary rounded flex items-center justify-center text-white text-xs font-bold">T</div>
          <span className="text-lg font-bold text-gray-900">TaskMan</span>
        </div>
        <p className="text-gray-400 text-sm">© {new Date().getFullYear()} TaskMan. Built for builders.</p>
        <div className="flex gap-6 text-sm text-gray-500">
          <a href="#" className="hover:text-primary transition-colors">Privacy</a>
          <a href="#" className="hover:text-primary transition-colors">Terms</a>
          <a href="#" className="hover:text-primary transition-colors">Contact</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;