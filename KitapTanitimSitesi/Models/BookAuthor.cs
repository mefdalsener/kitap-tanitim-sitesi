namespace KitapTanitimSitesi.Models
{
    public class BookAuthor
    {
        public int BookID { get; set; }
        public int AuthorID { get; set; }

        public Book Book { get; set; } = null!;
        public Author Author { get; set; } = null!;
    }
}