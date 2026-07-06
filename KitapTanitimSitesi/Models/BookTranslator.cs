namespace KitapTanitimSitesi.Models
{
    public class BookTranslator
    {
        public int BookID { get; set; }
        public int TranslatorID { get; set; }

        public Book Book { get; set; } = null!;
        public Translator Translator { get; set; } = null!;
    }
}