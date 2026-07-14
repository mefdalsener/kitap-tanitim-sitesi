namespace KitapTanitimSitesi.Models
{
    public class Book
    {
        public int BookID { get; set; }
        public string BookName { get; set; } = string.Empty;
        public string? BookCoverImage_URL { get; set; }
        public string? BookDescription { get; set; }
        public int? FirstPublishYear { get; set; }
        public int? SeriesID { get; set; }
        public int? SeriesOrder { get; set; }
        public decimal? AverageRating { get; set; }
        public int? RatingCount { get; set; }

        // Navigation properties
        public Series? Series { get; set; }
        public ICollection<BookAuthor> BookAuthors { get; set; } = new List<BookAuthor>();
        public ICollection<BookGenre> BookGenres { get; set; } = new List<BookGenre>();
        public ICollection<BookPublisher> BookPublishers { get; set; } = new List<BookPublisher>();
        public ICollection<BookTranslator> BookTranslators { get; set; } = new List<BookTranslator>();
        public ICollection<BookRating> BookRatings { get; set; } = new List<BookRating>();
    }
}
