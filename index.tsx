import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, Type } from "@google/genai";
import { 
  LayoutDashboard, 
  FileText, 
  Package, 
  Plus, 
  Minus,
  Trash2, 
  Printer, 
  Save, 
  Upload, 
  Bot, 
  Search, 
  Settings,
  ChevronRight,
  Loader2,
  Download,
  Image as ImageIcon,
  Percent,
  Edit,
  X,
  Camera,
  FolderOpen,
  History,
  Palette,
  Database,
  RefreshCcw,
  Eye,
  EyeOff,
  MoveHorizontal,
  MoveVertical,
  Type as TypeIcon
} from "lucide-react";

// --- Types ---

interface Product {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  image?: string; // base64
}

interface InvoiceItem {
  id: string;
  productId?: string;
  description: string;
  itemCode: string; // The "Item" column
  price: number;
  qty: number;
  image?: string; // base64
}

interface InvoiceData {
  id?: string; // For drafts
  customerName: string;
  reference: string;
  date: string;
  items: InvoiceItem[];
  footerNote: string;
  savedAt?: string;
}

interface TableConfig {
  imageWidth: number; // Percentage
  itemWidth: number; // Percentage
  priceWidth: number; // Percentage
  qtyWidth: number; // Percentage
  totalWidth: number; // Percentage
  rowPadding: number; // Pixels
  fontSize: number; // Pixels
}

interface AppSettings {
  companyLogo: string; // base64 string
  taxRate: number;
  themeColor: string; // Hex color for invoice accent
  showImageColumn: boolean; // Toggle image column in invoice
  tableConfig: TableConfig;
}

declare var html2pdf: any;
declare var mammoth: any;

// --- Utils ---

const generateId = () => Math.random().toString(36).substr(2, 9);

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

const DEFAULT_COLOR = "#3b82f6"; // Blue-500
const DEFAULT_TABLE_CONFIG: TableConfig = {
  imageWidth: 10,
  itemWidth: 15,
  priceWidth: 15,
  qtyWidth: 10,
  totalWidth: 10,
  rowPadding: 8,
  fontSize: 14
};

// --- Components ---

// 1. Sidebar
const Sidebar = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: string) => void }) => {
  const menuItems = [
    { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
    { id: 'invoice', label: 'إنشاء فاتورة', icon: FileText },
    { id: 'inventory', label: 'المخزن (المنتجات)', icon: Package },
    { id: 'settings', label: 'الإعدادات والنسخ الاحتياطي', icon: Settings },
  ];

  return (
    <div className="w-64 bg-slate-900 text-white h-screen flex flex-col shadow-xl fixed right-0 top-0 z-50 no-print transition-all duration-300">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-blue-400 flex items-center gap-2">
          <FileText className="w-8 h-8" />
          <span>فاتورتي</span>
        </h1>
        <p className="text-slate-400 text-xs mt-1">نظام الفواتير الذكي</p>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === item.id 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' 
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
            {activeTab === item.id && <ChevronRight className="w-4 h-4 mr-auto" />}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <Bot className="w-4 h-4" />
          <span>مدعوم بواسطة Gemini AI</span>
        </div>
      </div>
    </div>
  );
};

// 2. Inventory / AI Parser
const Inventory = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const editImageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('products');
    if (stored) setProducts(JSON.parse(stored));
  }, []);

  const saveProducts = (newProducts: Product[]) => {
    setProducts(newProducts);
    localStorage.setItem('products', JSON.stringify(newProducts));
  };

  const handleDelete = (id: string) => {
    if(confirm('هل أنت متأكد من حذف هذا المنتج؟')) {
      saveProducts(products.filter(p => p.id !== id));
    }
  };

  const handleEditSave = () => {
    if (editingProduct) {
      const updatedProducts = products.map(p => p.id === editingProduct.id ? editingProduct : p);
      saveProducts(updatedProducts);
      setEditingProduct(null);
    }
  };

  const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editingProduct) {
      const base64 = await fileToBase64(file);
      setEditingProduct({ ...editingProduct, image: base64 });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!process.env.API_KEY) {
      alert("API Key is missing!");
      return;
    }

    setIsUploading(true);
    setUploadStatus("جاري تحليل الملف واستخراج البيانات...");

    try {
      let parts: any[] = [];
      let base64Data = "";
      
      const isWord = file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      if (isWord) {
        setUploadStatus("جاري قراءة ملف Word...");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
        const textContent = result.value;
        
        if (!textContent) {
          throw new Error("Could not extract text from Word file");
        }

        parts = [
          { text: "Here is the content of a Word document containing product information:" },
          { text: textContent },
          { text: "Extract product information from this text. Return a list of products found. For each product, extract: code (or item number), name, description, and price (as a number). If price is missing, put 0." }
        ];
      } else {
        base64Data = await fileToBase64(file);
        // Remove data header for API
        const base64Content = base64Data.split(',')[1];
        const mimeType = file.type;
        
        parts = [
            { inlineData: { mimeType: mimeType, data: base64Content } },
            { text: "Extract product information from this document/image. Return a list of products found. For each product, extract: code (or item number), name, description, and price (as a number). If price is missing, put 0." }
        ];
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Use structured output for reliable parsing
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: parts
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              products: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    code: { type: Type.STRING },
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    price: { type: Type.NUMBER },
                  }
                }
              }
            }
          }
        }
      });

      const text = response.text;
      if (text) {
        const data = JSON.parse(text);
        if (data.products && Array.isArray(data.products)) {
          const newItems: Product[] = data.products.map((p: any) => ({
            id: generateId(),
            code: p.code || 'N/A',
            name: p.name || 'منتج جديد',
            description: p.description || '',
            price: p.price || 0,
            image: (!isWord && base64Data && file.type.startsWith('image')) ? base64Data : undefined // Keep image if it was an image upload
          }));
          
          saveProducts([...products, ...newItems]);
          setUploadStatus(`تم استخراج ${newItems.length} منتج بنجاح!`);
        } else {
          setUploadStatus("لم يتم العثور على منتجات في الملف.");
        }
      }
    } catch (error) {
      console.error(error);
      setUploadStatus("حدث خطأ أثناء المعالجة.");
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadStatus(""), 3000);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="p-8 mr-64">
      {/* Edit Modal */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-lg">تعديل المنتج</h3>
              <button onClick={() => setEditingProduct(null)}><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Image Upload in Edit */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-32 h-32 bg-slate-100 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden relative group">
                  {editingProduct.image ? (
                    <img src={editingProduct.image} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-slate-400" />
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => editImageRef.current?.click()}>
                    <Camera className="w-8 h-8 text-white" />
                  </div>
                </div>
                <input 
                  type="file" 
                  ref={editImageRef} 
                  className="hidden" 
                  accept="image/*"
                  onChange={handleEditImageUpload}
                />
                <button onClick={() => editImageRef.current?.click()} className="text-sm text-blue-600 font-medium">تغيير الصورة</button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">الكود</label>
                    <input 
                      value={editingProduct.code} 
                      onChange={e => setEditingProduct({...editingProduct, code: e.target.value})}
                      className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">السعر</label>
                    <input 
                      type="number"
                      value={editingProduct.price} 
                      onChange={e => setEditingProduct({...editingProduct, price: parseFloat(e.target.value) || 0})}
                      className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                 </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">اسم المنتج</label>
                <input 
                  value={editingProduct.name} 
                  onChange={e => setEditingProduct({...editingProduct, name: e.target.value})}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">الوصف</label>
                <textarea 
                  value={editingProduct.description} 
                  onChange={e => setEditingProduct({...editingProduct, description: e.target.value})}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-24"
                />
              </div>
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
              <button onClick={() => setEditingProduct(null)} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg">إلغاء</button>
              <button onClick={handleEditSave} className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700">حفظ التغييرات</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">إدارة المخزن</h2>
          <p className="text-slate-500">قم بإضافة المنتجات يدوياً أو استخرجها من الصور، PDF، أو ملفات Word</p>
        </div>
        <div className="flex gap-3">
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileUpload} 
            accept="image/*,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg shadow-lg transition-all"
            disabled={isUploading}
          >
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Bot className="w-5 h-5" />}
            {isUploading ? "جاري التحليل..." : "استخراج بالذكاء الاصطناعي"}
          </button>
        </div>
      </div>

      {uploadStatus && (
        <div className={`mb-6 p-4 rounded-lg border ${uploadStatus.includes('خطأ') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
          {uploadStatus}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map(product => (
          <div key={product.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group relative">
            <div className="absolute top-4 left-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
               <button onClick={() => setEditingProduct(product)} className="p-2 bg-white rounded-full shadow hover:text-blue-600 text-slate-500 border border-slate-200">
                  <Edit className="w-4 h-4" />
               </button>
               <button onClick={() => handleDelete(product.id)} className="p-2 bg-white rounded-full shadow hover:text-red-600 text-slate-500 border border-slate-200">
                  <Trash2 className="w-4 h-4" />
               </button>
            </div>
            
            <div className="flex justify-between items-start mb-3">
              <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold font-mono">
                {product.code}
              </span>
            </div>
            
            {product.image ? (
               <img src={product.image} alt={product.name} className="w-full h-40 object-cover rounded-lg mb-4 bg-slate-50 border border-slate-100" />
            ) : (
               <div className="w-full h-40 bg-slate-50 rounded-lg mb-4 flex items-center justify-center border border-slate-100">
                  <ImageIcon className="w-10 h-10 text-slate-300" />
               </div>
            )}
            
            <h3 className="font-bold text-lg text-slate-800 mb-1">{product.name}</h3>
            <p className="text-slate-500 text-sm mb-4 line-clamp-2 h-10">{product.description}</p>
            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              <span className="text-slate-400 text-sm">السعر</span>
              <span className="text-xl font-bold text-blue-600">€{product.price.toLocaleString()}</span>
            </div>
          </div>
        ))}
        
        {products.length === 0 && (
          <div className="col-span-full py-20 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
            <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">المخزن فارغ</p>
            <p className="text-sm">ابدأ برفع صورة فاتورة، ملف PDF، أو ملف Word</p>
          </div>
        )}
      </div>
    </div>
  );
};

// 3. Settings View
const SettingsView = () => {
  const [settings, setSettings] = useState<AppSettings>({
    companyLogo: '',
    taxRate: 0,
    themeColor: DEFAULT_COLOR,
    showImageColumn: true,
    tableConfig: DEFAULT_TABLE_CONFIG
  });
  const [saved, setSaved] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const colors = [
    { name: 'أزرق', value: '#3b82f6' },
    { name: 'أحمر', value: '#ef4444' },
    { name: 'أخضر', value: '#10b981' },
    { name: 'بنفسجي', value: '#8b5cf6' },
    { name: 'رمادي', value: '#64748b' },
    { name: 'أسود', value: '#1e293b' },
  ];

  useEffect(() => {
    const stored = localStorage.getItem('appSettings');
    if (stored) {
      const parsed = JSON.parse(stored);
      setSettings({
        ...parsed,
        themeColor: parsed.themeColor || DEFAULT_COLOR,
        showImageColumn: parsed.showImageColumn !== undefined ? parsed.showImageColumn : true,
        tableConfig: parsed.tableConfig ? { ...DEFAULT_TABLE_CONFIG, ...parsed.tableConfig } : DEFAULT_TABLE_CONFIG
      });
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('appSettings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (file) {
       const base64 = await fileToBase64(file);
       setSettings({ ...settings, companyLogo: base64 });
     }
  };

  const handleBackup = () => {
    const backupData = {
      products: JSON.parse(localStorage.getItem('products') || '[]'),
      drafts: JSON.parse(localStorage.getItem('invoiceDrafts') || '[]'),
      settings: JSON.parse(localStorage.getItem('appSettings') || '{}')
    };
    
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.products) localStorage.setItem('products', JSON.stringify(data.products));
        if (data.drafts) localStorage.setItem('invoiceDrafts', JSON.stringify(data.drafts));
        if (data.settings) localStorage.setItem('appSettings', JSON.stringify(data.settings));
        
        alert('تم استعادة البيانات بنجاح! سيتم تحديث الصفحة.');
        window.location.reload();
      } catch (err) {
        alert('حدث خطأ أثناء قراءة ملف النسخة الاحتياطية. تأكد من صحة الملف.');
      }
    };
    reader.readAsText(file);
    if(restoreInputRef.current) restoreInputRef.current.value = "";
  };

  const updateTableConfig = (key: keyof TableConfig, value: number) => {
    setSettings(prev => ({
      ...prev,
      tableConfig: { ...prev.tableConfig, [key]: value }
    }));
  };

  return (
    <div className="p-8 mr-64">
      <div className="max-w-4xl mx-auto space-y-8">
        <h2 className="text-3xl font-bold text-slate-800 mb-8 flex items-center gap-3">
          <Settings className="w-8 h-8 text-blue-600" />
          الإعدادات والنسخ الاحتياطي
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* General Settings */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Palette className="w-5 h-5 text-slate-500" />
              المظهر والفاتورة
            </h3>

            <div>
              <label className="block text-slate-700 font-medium mb-2 flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                شعار الشركة (Logo)
              </label>
              
              <div className="flex items-center gap-4">
                <div 
                  onClick={() => logoInputRef.current?.click()}
                  className="w-20 h-20 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors bg-slate-50 overflow-hidden"
                >
                  {settings.companyLogo ? (
                    <img src={settings.companyLogo} className="w-full h-full object-contain" />
                  ) : (
                    <Upload className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                <div className="flex-1">
                  <input 
                    type="file" 
                    ref={logoInputRef}
                    onChange={handleLogoUpload}
                    className="hidden"
                    accept="image/*"
                  />
                  <button onClick={() => logoInputRef.current?.click()} className="text-sm text-blue-600 font-medium hover:underline">تغيير الصورة</button>
                  {settings.companyLogo && (
                    <button onClick={() => setSettings({...settings, companyLogo: ''})} className="block mt-1 text-sm text-red-500 hover:underline">
                      إزالة
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-2 flex items-center gap-2">
                <Palette className="w-4 h-4" />
                لون القالب
              </label>
              <div className="flex gap-2 flex-wrap">
                {colors.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setSettings({...settings, themeColor: c.value})}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${settings.themeColor === c.value ? 'border-slate-800 scale-110 shadow-md' : 'border-transparent'}`}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-2 flex items-center gap-2">
                <Percent className="w-4 h-4" />
                نسبة الضريبة (%)
              </label>
              <input 
                type="number" 
                value={settings.taxRate}
                onChange={(e) => setSettings({...settings, taxRate: parseFloat(e.target.value) || 0})}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                min="0"
                max="100"
              />
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
               <button 
                 onClick={() => setSettings({...settings, showImageColumn: !settings.showImageColumn})}
                 className={`w-10 h-6 rounded-full p-1 transition-colors ${settings.showImageColumn ? 'bg-blue-600' : 'bg-slate-300'}`}
               >
                 <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${settings.showImageColumn ? 'translate-x-[-16px]' : ''}`} />
               </button>
               <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
                 {settings.showImageColumn ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                 إظهار عمود الصور في الفاتورة
               </span>
            </div>
          </div>
          
           {/* Table Customization */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <MoveHorizontal className="w-5 h-5 text-slate-500" />
              تخصيص الجدول
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="flex justify-between text-sm font-medium text-slate-700">
                  <span className="flex items-center gap-2"><MoveVertical className="w-4 h-4" /> ارتفاع الصفوف (Padding)</span>
                  <span className="text-blue-600">{settings.tableConfig.rowPadding}px</span>
                </label>
                <input type="range" min="4" max="32" value={settings.tableConfig.rowPadding} onChange={(e) => updateTableConfig('rowPadding', parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
              </div>

              <div className="space-y-2">
                <label className="flex justify-between text-sm font-medium text-slate-700">
                  <span className="flex items-center gap-2"><TypeIcon className="w-4 h-4" /> حجم الخط</span>
                  <span className="text-blue-600">{settings.tableConfig.fontSize}px</span>
                </label>
                <input type="range" min="10" max="24" value={settings.tableConfig.fontSize} onChange={(e) => updateTableConfig('fontSize', parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
              </div>

              <div className="border-t pt-4">
                 <p className="text-sm font-bold text-slate-700 mb-3">عرض الأعمدة (%)</p>
                 
                 {settings.showImageColumn && (
                  <div className="space-y-2 mb-3">
                    <label className="flex justify-between text-xs text-slate-500">
                      <span>عرض الصور</span>
                      <span>{settings.tableConfig.imageWidth}%</span>
                    </label>
                    <input type="range" min="5" max="30" value={settings.tableConfig.imageWidth} onChange={(e) => updateTableConfig('imageWidth', parseInt(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                  </div>
                 )}

                 <div className="space-y-2 mb-3">
                    <label className="flex justify-between text-xs text-slate-500">
                      <span>عرض الكود (Item)</span>
                      <span>{settings.tableConfig.itemWidth}%</span>
                    </label>
                    <input type="range" min="5" max="30" value={settings.tableConfig.itemWidth} onChange={(e) => updateTableConfig('itemWidth', parseInt(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                  </div>

                  <div className="space-y-2 mb-3">
                    <label className="flex justify-between text-xs text-slate-500">
                      <span>عرض السعر (Price)</span>
                      <span>{settings.tableConfig.priceWidth}%</span>
                    </label>
                    <input type="range" min="5" max="30" value={settings.tableConfig.priceWidth} onChange={(e) => updateTableConfig('priceWidth', parseInt(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                  </div>
                  
                  <div className="space-y-2 mb-3">
                    <label className="flex justify-between text-xs text-slate-500">
                      <span>عرض الكمية (Qty)</span>
                      <span>{settings.tableConfig.qtyWidth}%</span>
                    </label>
                    <input type="range" min="5" max="20" value={settings.tableConfig.qtyWidth} onChange={(e) => updateTableConfig('qtyWidth', parseInt(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                  </div>

                  <div className="space-y-2">
                    <label className="flex justify-between text-xs text-slate-500">
                      <span>عرض الإجمالي (Total)</span>
                      <span>{settings.tableConfig.totalWidth}%</span>
                    </label>
                    <input type="range" min="5" max="30" value={settings.tableConfig.totalWidth} onChange={(e) => updateTableConfig('totalWidth', parseInt(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                  </div>
                  
                  <p className="text-xs text-slate-400 mt-2">
                    * المساحة المتبقية تذهب لعمود الوصف (Description) تلقائياً.
                  </p>
              </div>
            </div>
          </div>

          {/* Backup & Restore */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Database className="w-5 h-5 text-slate-500" />
                البيانات والنسخ الاحتياطي
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                جميع بياناتك مخزنة محلياً في المتصفح. قم بعمل نسخة احتياطية بشكل دوري لتجنب فقدان البيانات.
              </p>
              
              <div className="space-y-3">
                <button 
                  onClick={handleBackup}
                  className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 rounded-lg border border-slate-200 transition-all"
                >
                  <Download className="w-5 h-5" />
                  تحميل نسخة احتياطية (JSON)
                </button>

                <div className="relative">
                  <input 
                    type="file" 
                    ref={restoreInputRef}
                    onChange={handleRestore}
                    className="hidden"
                    accept=".json"
                  />
                  <button 
                    onClick={() => restoreInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 rounded-lg border border-slate-200 transition-all"
                  >
                    <RefreshCcw className="w-5 h-5" />
                    استعادة نسخة احتياطية
                  </button>
                </div>
              </div>
            </div>

            <button 
              onClick={handleSave}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all flex justify-center items-center gap-2"
            >
              <Save className="w-5 h-5" />
              {saved ? "تم الحفظ بنجاح!" : "حفظ الإعدادات"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// 4. Invoice Editor
const InvoiceEditor = () => {
  const [data, setData] = useState<InvoiceData>({
    customerName: 'Customer name :',
    reference: 'Offer references',
    date: new Date().toLocaleDateString('en-GB'),
    items: [],
    footerNote: 'مدة الشحن 3 اشهر من الموافقة'
  });
  
  const [inventory, setInventory] = useState<Product[]>([]);
  const [filteredInventory, setFilteredInventory] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [savedDrafts, setSavedDrafts] = useState<InvoiceData[]>([]);
  
  const [settings, setSettings] = useState<AppSettings>({ 
    companyLogo: '', 
    taxRate: 0, 
    themeColor: DEFAULT_COLOR,
    showImageColumn: true,
    tableConfig: DEFAULT_TABLE_CONFIG
  });
  
  const rowImageInputRef = useRef<HTMLInputElement>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  useEffect(() => {
    const storedProducts = localStorage.getItem('products');
    if (storedProducts) {
      const parsed = JSON.parse(storedProducts);
      setInventory(parsed);
      setFilteredInventory(parsed);
    }
    
    const storedSettings = localStorage.getItem('appSettings');
    if (storedSettings) {
      const parsed = JSON.parse(storedSettings);
      setSettings({
        ...parsed,
        themeColor: parsed.themeColor || DEFAULT_COLOR,
        showImageColumn: parsed.showImageColumn !== undefined ? parsed.showImageColumn : true,
        tableConfig: parsed.tableConfig ? { ...DEFAULT_TABLE_CONFIG, ...parsed.tableConfig } : DEFAULT_TABLE_CONFIG
      });
    }

    const storedDrafts = localStorage.getItem('invoiceDrafts');
    if (storedDrafts) setSavedDrafts(JSON.parse(storedDrafts));

    if(data.items.length === 0) {
       addItem();
    }
  }, []);

  useEffect(() => {
    if (!searchQuery) {
      setFilteredInventory(inventory);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredInventory(inventory.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.code.toLowerCase().includes(q)
      ));
    }
  }, [searchQuery, inventory]);

  const updateField = (field: keyof InvoiceData, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const addItem = (product?: Product) => {
    const newItem: InvoiceItem = {
      id: generateId(),
      productId: product?.id,
      itemCode: product?.code || '',
      description: product ? `${product.name} - ${product.description}` : '',
      price: product?.price || 0,
      qty: 1,
      image: product?.image
    };
    setData(prev => ({ ...prev, items: [...prev.items, newItem] }));
    setShowProductPicker(false);
    setSearchQuery(""); // Reset search on close
  };

  const updateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setData(prev => ({
      ...prev,
      items: prev.items.map(item => item.id === id ? { ...item, [field]: value } : item)
    }));
  };

  const removeItem = (id: string) => {
    setData(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }));
  };

  const handleRowImageClick = (itemId: string) => {
    setActiveRowId(itemId);
    rowImageInputRef.current?.click();
  };

  const handleRowImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeRowId) {
      const base64 = await fileToBase64(file);
      updateItem(activeRowId, 'image', base64);
      setActiveRowId(null);
    }
    if (rowImageInputRef.current) rowImageInputRef.current.value = "";
  };

  const calculateSubtotal = () => {
    return data.items.reduce((acc, item) => acc + (item.price * item.qty), 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const taxAmount = subtotal * (settings.taxRate / 100);
    return subtotal + taxAmount;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    const element = document.getElementById('invoice-paper');
    if (!element || typeof html2pdf === 'undefined') {
      alert('PDF generation library not loaded or element missing.');
      return;
    }

    const opt = {
      margin: 0,
      filename: `invoice-${data.reference || 'draft'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
  };

  const handleSaveDraft = () => {
    const draftId = data.id || generateId();
    const draftToSave = { 
      ...data, 
      id: draftId, 
      savedAt: new Date().toLocaleString() 
    };
    
    // Check if updating existing draft or creating new
    let updatedDrafts;
    const existingIndex = savedDrafts.findIndex(d => d.id === draftId);
    
    if (existingIndex >= 0) {
      updatedDrafts = [...savedDrafts];
      updatedDrafts[existingIndex] = draftToSave;
    } else {
      updatedDrafts = [draftToSave, ...savedDrafts];
    }

    setSavedDrafts(updatedDrafts);
    localStorage.setItem('invoiceDrafts', JSON.stringify(updatedDrafts));
    setData(draftToSave); // Update current state with ID
    alert('تم حفظ المسودة بنجاح!');
  };

  const handleLoadDraft = (draft: InvoiceData) => {
    if(confirm('هل أنت متأكد؟ سيتم استبدال البيانات الحالية بالمسودة.')) {
      setData(draft);
      setShowDrafts(false);
    }
  };

  const handleDeleteDraft = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if(confirm('حذف هذه المسودة نهائياً؟')) {
      const updated = savedDrafts.filter(d => d.id !== id);
      setSavedDrafts(updated);
      localStorage.setItem('invoiceDrafts', JSON.stringify(updated));
    }
  };

  // Convert hex to rgb for rgba usage
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '59, 130, 246';
  };

  const accentColor = settings.themeColor;
  const accentLight = `rgba(${hexToRgb(accentColor)}, 0.1)`;
  const accentGradient = `linear-gradient(to bottom, #f1f5f9, ${accentLight})`;
  
  // Table Layout Calculation
  const { tableConfig } = settings;
  const usedWidth = (settings.showImageColumn ? tableConfig.imageWidth : 0) + tableConfig.itemWidth + tableConfig.priceWidth + tableConfig.qtyWidth + tableConfig.totalWidth;
  const descriptionWidth = Math.max(10, 100 - usedWidth); // Ensure at least 10%

  const commonCellStyle = {
    borderColor: accentColor,
    paddingTop: `${tableConfig.rowPadding}px`,
    paddingBottom: `${tableConfig.rowPadding}px`,
    fontSize: `${tableConfig.fontSize}px`
  };

  return (
    <div className="flex min-h-screen bg-slate-100 mr-64">
      {/* Hidden input for row image upload */}
      <input 
        type="file" 
        ref={rowImageInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handleRowImageChange} 
      />

      {/* Product Picker Modal */}
      {showProductPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b">
               <div className="flex justify-between items-center mb-3">
                 <h3 className="font-bold text-lg">اختر منتج من المخزن</h3>
                 <button onClick={() => setShowProductPicker(false)} className="text-slate-400 hover:text-slate-600">✕</button>
               </div>
               <div className="relative">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                 <input 
                   type="text"
                   placeholder="بحث باسم المنتج أو الكود..."
                   className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                   value={searchQuery}
                   onChange={e => setSearchQuery(e.target.value)}
                   autoFocus
                 />
               </div>
            </div>
            <div className="p-4 overflow-y-auto grid grid-cols-1 gap-2 flex-1">
               {filteredInventory.map(p => (
                 <button 
                  key={p.id} 
                  onClick={() => addItem(p)}
                  className="flex items-center gap-4 p-3 hover:bg-blue-50 border rounded-lg text-right transition-colors"
                 >
                   {p.image ? (
                     <img src={p.image} className="w-12 h-12 object-cover rounded bg-slate-200" />
                   ) : (
                     <div className="w-12 h-12 bg-slate-100 rounded flex items-center justify-center text-slate-400">
                       <Package className="w-6 h-6" />
                     </div>
                   )}
                   <div className="flex-1">
                     <div className="font-bold text-slate-800">{p.name}</div>
                     <div className="text-xs text-slate-500 font-mono bg-slate-100 inline-block px-1 rounded mt-1">CODE: {p.code}</div>
                   </div>
                   <div className="font-bold text-blue-600">€{p.price}</div>
                 </button>
               ))}
               {filteredInventory.length === 0 && (
                 <p className="text-center py-8 text-slate-500">
                   {inventory.length === 0 ? "المخزن فارغ. أضف منتجات أولاً." : "لا توجد نتائج مطابقة."}
                 </p>
               )}
            </div>
          </div>
        </div>
      )}

      {/* Drafts Modal */}
      {showDrafts && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-blue-600" />
                المسودات المحفوظة
              </h3>
              <button onClick={() => setShowDrafts(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedDrafts.length > 0 ? savedDrafts.map((draft, idx) => (
                <div 
                  key={draft.id || idx} 
                  onClick={() => handleLoadDraft(draft)}
                  className="border border-slate-200 rounded-lg p-4 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all relative group"
                >
                   <button 
                    onClick={(e) => handleDeleteDraft(draft.id!, e)}
                    className="absolute top-2 left-2 p-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                   >
                     <Trash2 className="w-4 h-4" />
                   </button>
                   <div className="mb-2">
                     <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">{draft.savedAt}</span>
                   </div>
                   <h4 className="font-bold text-slate-800 mb-1 line-clamp-1">{draft.customerName}</h4>
                   <p className="text-sm text-slate-500 mb-2">{draft.reference}</p>
                   <div className="flex justify-between items-center text-sm">
                     <span className="text-slate-500">{draft.items.length} منتجات</span>
                     <span className="font-bold text-blue-600">
                        {/* Calculate total for preview */}
                        €{draft.items.reduce((acc, i) => acc + (i.price * i.qty), 0).toLocaleString()}
                     </span>
                   </div>
                </div>
              )) : (
                <div className="col-span-full py-12 text-center text-slate-400">
                  <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>لا توجد مسودات محفوظة.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 p-8 flex flex-col items-center">
        
        {/* Toolbar */}
        <div className="w-full max-w-[21cm] mb-6 flex justify-between items-center no-print flex-wrap gap-4">
          <div className="flex gap-2">
             <button onClick={() => setShowProductPicker(true)} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition">
               <Search className="w-4 h-4" />
               إضافة منتج
             </button>
             <button onClick={() => addItem()} className="flex items-center gap-2 bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50 transition">
               <Plus className="w-4 h-4" />
               صف فارغ
             </button>
          </div>
          
          <div className="flex gap-2 items-center">
             <div className="h-8 w-px bg-slate-300 mx-1"></div>
             
             <button onClick={() => setShowDrafts(true)} className="flex items-center gap-2 text-slate-600 hover:text-blue-600 px-3 py-2 rounded-lg hover:bg-blue-50 transition" title="فتح المسودات">
               <FolderOpen className="w-5 h-5" />
             </button>
             
             <button onClick={handleSaveDraft} className="flex items-center gap-2 text-slate-600 hover:text-green-600 px-3 py-2 rounded-lg hover:bg-green-50 transition" title="حفظ كمسودة">
               <Save className="w-5 h-5" />
             </button>

             <div className="h-8 w-px bg-slate-300 mx-1"></div>

             <button onClick={handleExportPDF} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 shadow-lg shadow-red-500/30 transition">
              <Download className="w-4 h-4" />
              تصدير PDF
            </button>
            <button onClick={handlePrint} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition">
              <Printer className="w-4 h-4" />
              طباعة
            </button>
          </div>
        </div>

        {/* The Paper (A4 Aspect Ratio) */}
        <div id="invoice-paper" className="invoice-paper bg-white w-full max-w-[21cm] min-h-[29.7cm] shadow-xl p-10 md:p-16 relative text-slate-900 mx-auto transition-all">
          
          {/* Logo Header */}
          {settings.companyLogo && (
            <div className="mb-8 flex justify-center">
              <img src={settings.companyLogo} alt="Company Logo" className="h-24 object-contain" />
            </div>
          )}

          {/* Header Bubbles */}
          <div className="flex justify-between items-start mb-16 gap-8">
            <div 
              className="w-1/2 rounded-xl p-4 shadow-inner border border-slate-300"
              style={{ background: accentGradient }}
            >
               <input 
                 value={data.reference}
                 onChange={(e) => updateField('reference', e.target.value)}
                 className="w-full bg-transparent border-none text-center font-bold text-lg focus:ring-0 placeholder-slate-500"
                 placeholder="Offer references"
               />
            </div>
            <div 
              className="w-1/2 rounded-xl p-4 shadow-inner border border-slate-300"
              style={{ background: accentGradient }}
            >
              <input 
                 value={data.customerName}
                 onChange={(e) => updateField('customerName', e.target.value)}
                 className="w-full bg-transparent border-none text-center font-bold text-lg focus:ring-0 placeholder-slate-500"
                 placeholder="Customer name :"
               />
            </div>
          </div>

          {/* Table */}
          <div className="w-full mb-12">
            <div className="flex border border-black font-bold text-center bg-white" style={{ borderColor: accentColor, fontSize: `${tableConfig.fontSize}px` }}>
              {settings.showImageColumn && (
                <div className="border-r flex items-center justify-center p-2" style={{ width: `${tableConfig.imageWidth}%`, borderColor: accentColor }}><ImageIcon className="w-4 h-4" /></div>
              )}
              <div className="border-r p-2" style={{ width: `${tableConfig.itemWidth}%`, borderColor: accentColor }}>Item</div>
              <div className="border-r p-2" style={{ width: `${descriptionWidth}%`, borderColor: accentColor }}>Description</div>
              <div className="border-r p-2" style={{ width: `${tableConfig.priceWidth}%`, borderColor: accentColor }}>Price</div>
              <div className="border-r p-2" style={{ width: `${tableConfig.qtyWidth}%`, borderColor: accentColor }}>QTY</div>
              <div className="p-2" style={{ width: `${tableConfig.totalWidth}%` }}>Total</div>
            </div>

            {data.items.map((item, index) => (
              <div key={item.id} className="flex border-l border-r border-b text-center group hover:bg-slate-50 relative min-h-[50px]" style={{ borderColor: accentColor }}>
                
                {/* Delete button (hidden on print and PDF export) */}
                <button 
                  data-html2canvas-ignore="true"
                  onClick={() => removeItem(item.id)}
                  className="absolute -right-8 top-2 text-red-300 hover:text-red-500 no-print opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                {/* Image Cell */}
                {settings.showImageColumn && (
                  <div className="border-r flex items-center justify-center relative group/img cursor-pointer" style={{ ...commonCellStyle, width: `${tableConfig.imageWidth}%` }} onClick={() => handleRowImageClick(item.id)}>
                    {item.image ? (
                      <img src={item.image} className="w-10 h-10 object-cover rounded shadow-sm" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-300">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity">
                        <Edit className="w-4 h-4 text-white" />
                    </div>
                  </div>
                )}

                {/* Item Code */}
                <div className="border-r" style={{ ...commonCellStyle, width: `${tableConfig.itemWidth}%` }}>
                  <textarea
                    rows={1}
                    value={item.itemCode}
                    onChange={(e) => updateItem(item.id, 'itemCode', e.target.value)}
                    className="w-full h-full bg-transparent resize-none focus:ring-0 border-none text-center font-medium"
                    style={{ fontSize: 'inherit' }}
                  />
                </div>
                
                {/* Description */}
                <div className="border-r" style={{ ...commonCellStyle, width: `${descriptionWidth}%` }}>
                   <textarea
                    rows={1}
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                    className="w-full h-full bg-transparent resize-none focus:ring-0 border-none text-left dir-auto"
                    style={{ direction: 'inherit', fontSize: 'inherit' }}
                  />
                </div>

                {/* Price */}
                <div className="border-r relative" style={{ ...commonCellStyle, width: `${tableConfig.priceWidth}%` }}>
                   <span className="absolute left-1 top-2 text-xs text-slate-400 pointer-events-none">€</span>
                   <input
                    type="number"
                    value={item.price}
                    onChange={(e) => updateItem(item.id, 'price', parseFloat(e.target.value) || 0)}
                    className="w-full h-full bg-transparent focus:ring-0 border-none text-center"
                    style={{ fontSize: 'inherit' }}
                  />
                </div>

                {/* Qty with Controls */}
                <div className="border-r flex items-center justify-between relative group/qty" style={{ ...commonCellStyle, width: `${tableConfig.qtyWidth}%` }}>
                   <button 
                    data-html2canvas-ignore="true"
                    onClick={() => updateItem(item.id, 'qty', Math.max(0, item.qty - 1))}
                    className="absolute left-0 top-0 bottom-0 px-1 text-slate-300 hover:text-slate-600 hover:bg-slate-100 no-print opacity-0 group-hover/qty:opacity-100 transition-opacity z-10"
                   >
                     <Minus className="w-3 h-3" />
                   </button>
                   
                   <input
                    type="number"
                    value={item.qty}
                    onChange={(e) => updateItem(item.id, 'qty', parseFloat(e.target.value) || 0)}
                    className="w-full h-full bg-transparent focus:ring-0 border-none text-center"
                    style={{ fontSize: 'inherit' }}
                  />
                  
                  <button 
                    data-html2canvas-ignore="true"
                    onClick={() => updateItem(item.id, 'qty', item.qty + 1)}
                    className="absolute right-0 top-0 bottom-0 px-1 text-slate-300 hover:text-slate-600 hover:bg-slate-100 no-print opacity-0 group-hover/qty:opacity-100 transition-opacity z-10"
                   >
                     <Plus className="w-3 h-3" />
                   </button>
                </div>

                {/* Total */}
                <div className="flex items-center justify-center font-bold bg-slate-50" style={{ ...commonCellStyle, width: `${tableConfig.totalWidth}%` }}>
                   €{(item.price * item.qty).toLocaleString()}
                </div>
              </div>
            ))}
            
            {/* Empty rows filler */}
            {data.items.length < 5 && Array.from({ length: 5 - data.items.length }).map((_, i) => (
               <div key={`empty-${i}`} className="flex border-l border-r border-b h-12" style={{ borderColor: accentColor }}>
                 {settings.showImageColumn && <div className="border-r" style={{ width: `${tableConfig.imageWidth}%`, borderColor: accentColor }}></div>}
                 <div className="border-r" style={{ width: `${tableConfig.itemWidth}%`, borderColor: accentColor }}></div>
                 <div className="border-r" style={{ width: `${descriptionWidth}%`, borderColor: accentColor }}></div>
                 <div className="border-r" style={{ width: `${tableConfig.priceWidth}%`, borderColor: accentColor }}></div>
                 <div className="border-r" style={{ width: `${tableConfig.qtyWidth}%`, borderColor: accentColor }}></div>
                 <div style={{ width: `${tableConfig.totalWidth}%` }}></div>
               </div>
            ))}
          </div>

          {/* Footer Area */}
          <div className="flex justify-between items-end mt-auto pt-12">
            
            {/* Shipping Note Bubble */}
            <div 
              className="rounded-lg p-3 shadow-inner border border-slate-300 w-1/3"
              style={{ background: accentGradient }}
            >
              <textarea
                value={data.footerNote}
                onChange={(e) => updateField('footerNote', e.target.value)}
                className="w-full bg-transparent border-none text-center font-bold text-sm resize-none focus:ring-0"
                rows={2}
              />
            </div>

            {/* Total Bubble with Tax */}
            <div 
              className="rounded-lg px-6 py-3 shadow-inner border border-slate-300 min-w-[250px]"
              style={{ background: accentGradient }}
            >
              {settings.taxRate > 0 && (
                <>
                  <div className="flex justify-between items-center text-sm border-b border-slate-400/30 pb-2 mb-2">
                    <span className="text-slate-600">المجموع الفرعي:</span>
                    <span className="font-bold">€{calculateSubtotal().toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-b border-slate-400/30 pb-2 mb-2">
                    <span className="text-slate-600">الضريبة ({settings.taxRate}%):</span>
                    <span className="font-bold">€{(calculateSubtotal() * settings.taxRate / 100).toLocaleString()}</span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between gap-4">
                <span className="font-bold text-lg">Total :</span>
                <span className="font-bold text-xl">€{calculateTotal().toLocaleString()}</span>
              </div>
            </div>

          </div>

          {/* Date Footer */}
          <div className="absolute bottom-8 right-16 font-mono text-sm text-slate-600">
             <input 
               value={data.date}
               onChange={(e) => updateField('date', e.target.value)}
               className="bg-transparent border-none text-right focus:ring-0" 
             />
          </div>

        </div>
        <p className="mt-8 text-slate-400 text-sm no-print">Tip: Click on the image icon in the table to add product images directly.</p>
      </div>
    </div>
  );
};

// 4. Dashboard (Welcome Screen)
const Dashboard = ({ goTo }: { goTo: (t: string) => void }) => (
  <div className="p-12 mr-64 flex flex-col items-center justify-center min-h-screen bg-slate-50">
    <div className="text-center max-w-2xl">
      <div className="bg-blue-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
        <FileText className="w-12 h-12 text-blue-600" />
      </div>
      <h1 className="text-4xl font-bold text-slate-900 mb-4">برنامج الفواتير وعروض الأسعار</h1>
      <p className="text-xl text-slate-600 mb-12">
        نظام ذكي يستخرج البيانات من الصور والملفات، ينظم مخزونك، ويقوم بإنشاء فواتير احترافية قابلة للتعديل بالكامل.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        <button 
          onClick={() => goTo('inventory')}
          className="group bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-500 hover:shadow-md transition-all text-right"
        >
          <div className="bg-green-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Upload className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">إضافة للمخزن</h3>
          <p className="text-slate-500">استخراج المنتجات من ملفات PDF أو الصور باستخدام الذكاء الاصطناعي.</p>
        </button>

        <button 
          onClick={() => goTo('invoice')}
          className="group bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-500 hover:shadow-md transition-all text-right"
        >
          <div className="bg-purple-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <FileText className="w-6 h-6 text-purple-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">إنشاء فاتورة</h3>
          <p className="text-slate-500">تصميم فاتورة قابل للتعديل (مثل الوورد) مع حساب تلقائي للأسعار.</p>
        </button>
      </div>
    </div>
  </div>
);

// --- Main App ---

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="transition-all duration-300">
        {activeTab === 'dashboard' && <Dashboard goTo={setActiveTab} />}
        {activeTab === 'inventory' && <Inventory />}
        {activeTab === 'invoice' && <InvoiceEditor />}
        {activeTab === 'settings' && <SettingsView />}
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);