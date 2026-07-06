namespace KitapTanitimSitesi.Models
{
    public class BookPublisher
    {
        public int BookID { get; set; }
        public int PublisherID { get; set; }
        public int? PageCount { get; set; }
        public int? PublishYear { get; set; }
        public string? ISBN { get; set; }

        public Book Book { get; set; } = null!;
        public Publisher Publisher { get; set; } = null!;
    }
}