using System.ComponentModel.DataAnnotations;

namespace KitapTanitimSitesi.Models.ViewModels
{
    public class SignupIndex
    {
        [Required, MaxLength(50)]
        [Display(Name = "Kullanıcı Adı")]
        public string Username { get; set; }

        [Required, EmailAddress, MaxLength(100)]
        [Display(Name = "E-Posta")]
        public string Email { get; set; }

        [Required, DataType(DataType.Password)]
        [Display(Name = "Şifre")]
        public string Password { get; set; }

        [Required, DataType(DataType.Password)]
        [Compare("Password", ErrorMessage = "Şifreler eşleşmiyor.")]
        [Display(Name = "Şifreyi Tekrarlayın")]
        public string PasswordConfirm { get; set; }
    }
}