namespace KitapTanitimSitesi.Models
{
    public class Author
    {
        public int AuthorID { get; set; }
        public string AuthorName { get; set; } = string.Empty;
        public string AuthorSurname { get; set; } = string.Empty;
        public string? AuthorImage_URL { get; set; }
        public string? AuthorBiography { get; set; }
        public int? AuthorBirthYear { get; set; }
        public int? AuthorDeathYear { get; set; }

        public ICollection<BookAuthor> BookAuthors { get; set; } = new List<BookAuthor>();

    }
}
