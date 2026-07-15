namespace KitapTanitimSitesi.Models.ViewModels
{
    public class BooklandViewModel
    {
        public List<Book> Books { get; set; } = new List<Book>();
        public List<Author> Authors { get; set; } = new List<Author>();
        public List<Publisher> Publishers { get; set; } = new List<Publisher>();
        public List<Translator> Translators { get; set; } = new List<Translator>();
        public List<Genre> Genres { get; set; } = new List<Genre>();
        public List<Series> SeriesList { get; set; } = new List<Series>();
        public List<int> PageCounts { get; set; } = new List<int>();

        // Giriş yapmış kullanıcının, henüz bu popup açılmadan bilmesi gereken
        // kendi verdiği puanlar: BookID -> RatingValue (1-5). Popup açılışında
        // ilgili kitabın yıldızlarını doğru sarıya boyamak için kullanılır.
        public Dictionary<int, byte> KullaniciPuanlari { get; set; } = new Dictionary<int, byte>();
    }
}