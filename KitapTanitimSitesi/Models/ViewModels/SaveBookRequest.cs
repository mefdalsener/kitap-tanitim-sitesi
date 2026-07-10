namespace KitapTanitimSitesi.Models.ViewModels
{
    public class SaveBookRequest
    {
        public BookInput Book { get; set; }
        public List<AuthorInput> Authors { get; set; } = new();
        public PublisherInput Publisher { get; set; }
        public List<TranslatorInput> Translators { get; set; } = new();
        public BookPublisherInput BookPublisher { get; set; }
        public List<string> Genres { get; set; } = new();
    }

    public class BookInput
    {
        public int? BookId { get; set; }
        public string BookName { get; set; }
        public string BookCoverImageUrl { get; set; }
        public string BookDescription { get; set; }
        public int? FirstPublishYear { get; set; }
        public int? SeriesId { get; set; }
        public int? SeriesOrder { get; set; }
    }

    public class AuthorInput
    {
        public int? Id { get; set; }
        public string Name { get; set; }
        public string Surname { get; set; }
        public string Biography { get; set; }
        public string ImageUrl { get; set; }
        public int? BirthYear { get; set; }
        public int? DeathYear { get; set; }
    }

    public class PublisherInput
    {
        public int? Id { get; set; }
        public string Name { get; set; }
    }

    public class TranslatorInput
    {
        public int? Id { get; set; }
        public string Name { get; set; }
        public string Surname { get; set; }
    }

    public class BookPublisherInput
    {
        public int? PageCount { get; set; }
        public int? PublishYear { get; set; }
        public string Isbn { get; set; }
    }
}