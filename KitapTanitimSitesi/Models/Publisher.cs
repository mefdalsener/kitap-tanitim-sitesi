namespace KitapTanitimSitesi.Models
{
    public class Publisher
    {
        public int PublisherID { get; set; }
        public string PublisherName { get; set; } = string.Empty;

        public ICollection<BookPublisher> BookPublishers { get; set; } = new List<BookPublisher>();

    }
}
