namespace KitapTanitimSitesi.Models
{
    public class Translator
    {
        public int TranslatorID { get; set; }
        public string TranslatorName { get; set; } = string.Empty;
        public string TranslatorSurname { get; set; } = string.Empty;

        public ICollection<BookTranslator> BookTranslators { get; set; } = new List<BookTranslator>();
    }
}